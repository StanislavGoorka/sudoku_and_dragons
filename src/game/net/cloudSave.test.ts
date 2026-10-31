import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, parseProgress, sameProgress, type Progress } from '../progress/progress.ts';

const transport = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), syncProfile: vi.fn() }));
vi.mock('./online.ts', () => ({
  supabase: { auth: { getSession: transport.getSession }, from: transport.from },
  syncProfile: transport.syncProfile,
}));

const PROGRESS = 'sudoku-dragons.progress';
const BASE = 'sudoku-dragons.cloud-base';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  blockedWrites = new Set<string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.blockedWrites.has(key)) throw new Error('storage full');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

interface Row { data: Progress; version: number }
let storage: MemoryStorage;
let row: Row | null;
let writes: number;
let readError: Error | null;
let writeError: Error | null;
let beforeWrite: (() => void) | null;

class Query {
  private operation = 'read';
  private fields!: Row;
  private version: number | undefined;
  select() { return this; }
  eq(key: string, value: unknown) { if (key === 'version') this.version = value as number; return this; }
  update(fields: Row) { this.operation = 'update'; this.fields = fields; return this; }
  insert(fields: Row) { this.operation = 'insert'; this.fields = fields; return this; }
  async maybeSingle() { return { data: structuredClone(row), error: readError }; }
  async run() {
    writes++;
    beforeWrite?.();
    if (writeError) return { data: null, error: writeError };
    if (this.operation === 'insert' && row) return { data: null, error: { code: '23505' } };
    if (this.operation === 'update' && row?.version !== this.version) return { data: [], error: null };
    row = structuredClone({ data: this.fields.data, version: this.fields.version });
    return { data: [{ version: row.version }], error: null };
  }
  then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { return this.run().then(resolve, reject); }
}

function sample(stars = 10, wins = 2): Progress {
  const p = emptyProgress();
  p.stars = p.starsEarned = stars;
  p.levels.easy.wins = wins;
  p.duels = { played: wins, won: 1 };
  return p;
}

async function modules() {
  return { cloud: await import('./cloudSave.ts'), store: await import('../progress/store.ts') };
}

async function open(local: Progress, remote: Progress | null, base?: Progress, owner?: { user: string | null; guest: boolean }) {
  storage.setItem(PROGRESS, JSON.stringify({ ...local, ...(owner ? { _cloudOwner: owner } : {}) }));
  if (base) storage.setItem(BASE, JSON.stringify({ user: 'account', version: 1, data: base }));
  row = remote ? { data: structuredClone(remote), version: base ? 2 : 1 } : null;
  return modules();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  row = null;
  writes = 0;
  readError = writeError = null;
  beforeWrite = null;
  transport.getSession.mockResolvedValue({ data: { session: { user: { id: 'account', is_anonymous: false } } } });
  transport.from.mockImplementation(() => new Query());
});

describe('cloud-save recovery', () => {
  it('does not add identical legacy snapshots when the base is missing', async () => {
    const saved = sample();
    const { cloud, store } = await open(saved, saved);
    await cloud.syncProgress();
    expect(sameProgress(store.progress, saved)).toBe(true);
    expect(row?.data.stars).toBe(10);
    expect(row?.data.levels.easy.wins).toBe(2);
    expect(writes).toBe(0);
    expect(cloud.cloudState()).toBe('synced');
  });

  it.each(['{broken', JSON.stringify({ user: 'account', version: -1, data: {} }),
    JSON.stringify({ user: 'account', version: 1, data: null })])('recovers a corrupt base: %s', async (base) => {
    const { cloud, store } = await open(sample(), sample());
    storage.setItem(BASE, base);
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(10);
    expect(writes).toBe(0);
  });

  it('keeps overlapping history once when different snapshots have no base', async () => {
    const { cloud, store } = await open(sample(12, 3), sample(15, 4));
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(15);
    expect(store.progress.levels.easy.wins).toBe(4);
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(15);
    expect(writes).toBe(0);
  });

  it('keeps an acknowledged base in memory when writing it fails, including later gains', async () => {
    const base = sample();
    const { cloud, store } = await open(sample(12, 3), base, base, { user: 'account', guest: false });
    row!.version = 1;
    storage.blockedWrites.add(BASE);
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(12);
    expect(storage.getItem(BASE)).toBeNull();
    store.progress.stars = store.progress.starsEarned = 14;
    store.saveProgress();
    await cloud.syncProgress();
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(14);
    expect(writes).toBe(2);
    vi.resetModules();
    const restarted = await modules();
    await restarted.cloud.syncProgress();
    expect(restarted.store.progress.stars).toBe(14);
    expect(writes).toBe(2);
  });

  it('still merges independent changes from a known common base', async () => {
    const { cloud, store } = await open(sample(12, 3), sample(13, 4), sample(10, 2));
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(15);
    expect(store.progress.levels.easy.wins).toBe(5);
    expect(writes).toBe(1);
  });

  it('imports a known guest once and remembers the account even after base loss', async () => {
    const { cloud, store } = await open(sample(10, 2), sample(20, 4), undefined, { user: 'guest', guest: true });
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
    expect(store.progress.levels.easy.wins).toBe(6);
    expect(JSON.parse(storage.getItem(PROGRESS)!)._cloudOwner).toEqual({ user: 'account', guest: false });
    storage.removeItem(BASE);
    vi.resetModules();
    const restarted = await modules();
    await restarted.cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
    expect(writes).toBe(1);
  });

  it('also imports a new guest who has never signed in online', async () => {
    row = { data: sample(20, 4), version: 1 };
    const { cloud, store } = await modules();
    Object.assign(store.progress, sample());
    store.saveProgress();
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
    await cloud.syncProgress();
    expect(writes).toBe(1);
  });

  it('does not import a known guest twice when checkpoint persistence fails', async () => {
    const { cloud } = await open(sample(), sample(20, 4), undefined, { user: 'guest', guest: true });
    storage.blockedWrites.add(BASE);
    await cloud.syncProgress();
    await cloud.syncProgress();
    vi.resetModules();
    await (await modules()).cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
    expect(writes).toBe(1);
  });

  it('adds identical independent gains when a common base is actually known', async () => {
    const current = sample(15, 3);
    const { cloud, store } = await open(current, current, sample());
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(20);
    expect(store.progress.levels.easy.wins).toBe(4);
    expect(writes).toBe(1);
  });

  it('keeps play that happens while an upload is in flight', async () => {
    const { cloud, store } = await open(sample(12, 3), sample(), sample(), { user: 'account', guest: false });
    row!.version = 1;
    beforeWrite = () => {
      beforeWrite = null;
      store.progress.stars = store.progress.starsEarned = 14;
      store.saveProgress();
    };
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(12);
    expect(store.progress.stars).toBe(14);
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(14);
  });

  it('retries a first-save conflict without adding the same snapshot twice', async () => {
    const { cloud, store } = await open(sample(), null);
    beforeWrite = () => { beforeWrite = null; row = { data: sample(), version: 1 }; };
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(10);
    expect(writes).toBe(1);
  });

  it('reports a read failure and leaves the local copy untouched', async () => {
    const { cloud, store } = await open(sample(), sample(15));
    readError = new Error('offline');
    await expect(cloud.syncProgress()).rejects.toThrow('offline');
    expect(store.progress.stars).toBe(10);
    expect(cloud.cloudState()).toBe('failed');
    expect(writes).toBe(0);
  });

  it('does not acknowledge a failed upload and discards its uncertain checkpoint', async () => {
    const { cloud, store } = await open(sample(12), sample(), sample(), { user: 'account', guest: false });
    row!.version = 1;
    writeError = new Error('offline');
    await expect(cloud.syncProgress()).rejects.toThrow('offline');
    expect(store.progress.stars).toBe(12);
    expect(storage.getItem(BASE)).toBeNull();
    expect(row?.data.stars).toBe(10);
    writeError = null;
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(12);
  });

  it('does not double a write whose response was lost after the server accepted it', async () => {
    const { cloud, store } = await open(sample(12, 3), sample(), sample(), { user: 'account', guest: false });
    row!.version = 1;
    beforeWrite = () => {
      beforeWrite = null;
      row = { data: sample(12, 3), version: 2 };
      writeError = new Error('response lost');
    };
    await expect(cloud.syncProgress()).rejects.toThrow('response lost');
    writeError = null;
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(12);
    expect(row?.data.stars).toBe(12);
    expect(writes).toBe(1);
  });

  it('postpones a guest import when the account-owned local snapshot cannot be persisted', async () => {
    const { cloud, store } = await open(sample(), sample(20, 4), undefined, { user: 'guest', guest: true });
    storage.blockedWrites.add(PROGRESS);
    storage.blockedWrites.add(BASE);
    await expect(cloud.syncProgress()).rejects.toThrow('storage');
    expect(row?.data.stars).toBe(20);
    expect(store.progress.stars).toBe(10);
    expect(store.progressOwner()).toEqual({ user: 'guest', guest: true });
    expect(writes).toBe(0);
    storage.blockedWrites.clear();
    await cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
  });

  it('does not re-import a guest after an accepted upload loses its response and the app restarts', async () => {
    const { cloud } = await open(sample(), sample(20, 4), undefined, { user: 'guest', guest: true });
    beforeWrite = () => {
      beforeWrite = null;
      row = { data: parseProgress(JSON.parse(storage.getItem(PROGRESS)!)), version: 2 };
      writeError = new Error('response lost');
    };
    await expect(cloud.syncProgress()).rejects.toThrow('response lost');
    writeError = null;
    vi.resetModules();
    const restarted = await modules();
    await restarted.cloud.syncProgress();
    expect(row?.data.stars).toBe(30);
    expect(restarted.store.progress.levels.easy.wins).toBe(6);
    expect(writes).toBe(1);
  });

  it('does not add a guest again when registration keeps the same user id', async () => {
    const { cloud, store } = await open(sample(), sample(), undefined, { user: 'account', guest: true });
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(10);
    expect(store.progressOwner()).toEqual({ user: 'account', guest: false });
    expect(writes).toBe(0);
  });

  it('does not turn account history into an independent guest after login credentials are lost', async () => {
    transport.getSession.mockResolvedValue({ data: { session: { user: { id: 'account', is_anonymous: true } } } });
    const { cloud, store } = await open(sample(), null, undefined, { user: 'old-account', guest: false });
    await cloud.syncProgress();
    expect(store.progressOwner()).toEqual({ user: 'account', guest: false });
    transport.getSession.mockResolvedValue({ data: { session: { user: { id: 'old-account', is_anonymous: false } } } });
    row = { data: sample(), version: 1 };
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(10);
    expect(row.data.stars).toBe(10);
    expect(writes).toBe(1);
  });

  it('recognizes an anonymous legacy save with a valid checkpoint as a known guest', async () => {
    transport.getSession.mockResolvedValue({ data: { session: { user: { id: 'account', is_anonymous: true } } } });
    const { cloud, store } = await open(sample(), sample(), sample());
    await cloud.syncProgress();
    expect(store.progressOwner()).toEqual({ user: 'account', guest: true });
  });

  it('does not restore the old account after logout during an upload', async () => {
    const { cloud, store } = await open(sample(12), sample(13), sample(), { user: 'account', guest: false });
    beforeWrite = () => {
      beforeWrite = null;
      transport.getSession.mockResolvedValue({ data: { session: null } });
      cloud.forgetCloudBase();
      store.replaceProgress(emptyProgress());
    };
    await cloud.syncProgress();
    expect(store.progress.stars).toBe(0);
    expect(store.progressOwner()).toEqual({ user: null, guest: true });
    expect(storage.getItem(BASE)).toBeNull();
  });

  it('starts a fresh guest after logout instead of inheriting account ownership', async () => {
    const { cloud, store } = await open(sample(), sample(), undefined, { user: 'account', guest: false });
    await cloud.syncProgress();
    cloud.forgetCloudBase();
    store.replaceProgress(emptyProgress());
    expect(JSON.parse(storage.getItem(PROGRESS)!)._cloudOwner).toEqual({ user: null, guest: true });
    expect(storage.getItem(BASE)).toBeNull();
  });
});
