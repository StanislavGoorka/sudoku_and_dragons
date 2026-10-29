import { profileSuffix } from '../profile.ts';
import { emptyProgress, mergeProgress, parseProgress, sameProgress, type Progress } from '../progress/progress.ts';
import { onProgressSaved, progress, replaceProgress } from '../progress/store.ts';
import { supabase, syncProfile } from './online.ts';

/**
 * The progress in the cloud (table `saves`), for whoever is signed in, guest or account. The device
 * keeps its own copy and plays from it; this module sends it up a moment after each save, and when
 * another device of the same account saved in between, merges the two (mergeProgress) from the last
 * version both agreed on: the base, kept on the device with the account it belongs to.
 */

const BASE_KEY = `sudoku-dragons.cloud-base${profileSuffix}`;
/** How long after a save the upload waits, so a burst of saves goes up once. */
const SYNC_DELAY_MS = 2000;

interface Base {
  /** The account this base belongs to. */
  user: string;
  version: number;
  data: Progress;
}

interface SaveRow {
  data: unknown;
  version: number;
}

export type CloudState = 'idle' | 'syncing' | 'synced' | 'failed';

let state: CloudState = 'idle';
const listeners = new Set<(state: CloudState) => void>();

export function cloudState(): CloudState {
  return state;
}

/** Called whenever the state changes; returns a function that stops it. */
export function onCloudState(listener: (state: CloudState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: CloudState): void {
  state = next;
  for (const listener of listeners) listener(next);
}

function readBase(): Base | null {
  try {
    const base = JSON.parse(localStorage.getItem(BASE_KEY) ?? 'null') as Base | null;
    return base && typeof base.user === 'string' && typeof base.version === 'number'
      ? { ...base, data: parseProgress(base.data) }
      : null;
  } catch {
    return null;
  }
}

function writeBase(base: Base | null): void {
  try {
    if (base) localStorage.setItem(BASE_KEY, JSON.stringify(base));
    else localStorage.removeItem(BASE_KEY);
  } catch {
    // Without a stored base the next sync merges from scratch, which only adds up twice what both sides have.
  }
}

/** After logging out: the next player on this device starts with no base. */
export function forgetCloudBase(): void {
  writeBase(null);
}

class CloudError extends Error {}

/** One round: read the cloud copy, merge if it moved, write over the version read. False: someone wrote first. */
async function syncRound(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getSession();
  const user = auth.session?.user.id;
  if (!user) return true;
  const stored = readBase();
  const base = stored?.user === user ? stored : null;
  const read = await supabase.from('saves').select('data, version').eq('user_id', user).maybeSingle<SaveRow>();
  if (read.error) throw new CloudError(read.error.message);
  const row = read.data;

  const local = parseProgress(progress);
  let next: Progress;
  if (!row) next = local;
  else if (base && row.version === base.version) {
    // Nobody else wrote: only this device's changes, if any.
    if (sameProgress(local, base.data)) return true;
    next = local;
  } else {
    // Another device wrote (or this device has no base with this account: a guest who just logged in).
    next = mergeProgress(base?.data ?? emptyProgress(), local, parseProgress(row.data));
  }

  const version = (row?.version ?? 0) + 1;
  if (row && sameProgress(next, parseProgress(row.data))) {
    writeBase({ user, version: row.version, data: next });
  } else if (row) {
    const write = await supabase
      .from('saves')
      .update({ data: next, version, updated_at: new Date().toISOString() })
      .eq('user_id', user)
      .eq('version', row.version)
      .select('version');
    if (write.error) throw new CloudError(write.error.message);
    if (write.data.length === 0) return false;
    writeBase({ user, version, data: next });
  } else {
    const write = await supabase.from('saves').insert({ user_id: user, data: next, version });
    // 23505: another device created it first.
    if (write.error?.code === '23505') return false;
    if (write.error) throw new CloudError(write.error.message);
    writeBase({ user, version, data: next });
  }

  if (!sameProgress(next, local)) {
    // Play may have gone on while the request was out: keep that too.
    const current = parseProgress(progress);
    replaceProgress(sameProgress(current, local) ? next : mergeProgress(local, current, next));
    syncProfile();
  }
  return true;
}

let chain: Promise<void> = Promise.resolve();

/**
 * Brings the cloud copy and this device's in line, one sync at a time. Rejects when the cloud
 * cannot be reached (the device's copy stays as it is; the next save tries again).
 */
export function syncProgress(): Promise<void> {
  const run = chain
    .catch(() => {})
    .then(async () => {
      setState('syncing');
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (await syncRound()) {
            setState('synced');
            return;
          }
        }
        throw new CloudError('conflict');
      } catch (error) {
        setState('failed');
        throw error;
      }
    });
  chain = run;
  return run;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync(delay = SYNC_DELAY_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncProgress().catch(() => {});
  }, delay);
}

/** Syncs now, after every save, and whenever the app comes back to the front. */
export function startCloudSave(): void {
  onProgressSaved(() => scheduleSync());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync(0);
  });
  scheduleSync(0);
}
