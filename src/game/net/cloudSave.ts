import { profileSuffix } from '../profile.ts';
import { emptyProgress, mergeProgress, parseProgress, recoverProgress, sameProgress, type Progress } from '../progress/progress.ts';
import { onProgressSaved, progress, progressOwner, replaceProgress, saveProgress, setProgressOwner } from '../progress/store.ts';
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

// Keep acknowledged state even if localStorage is full or temporarily unavailable.
let cachedBase: Base | null | undefined;

function readBase(): Base | null {
  if (cachedBase !== undefined) return cachedBase;
  try {
    const base = JSON.parse(localStorage.getItem(BASE_KEY) ?? 'null') as Base | null;
    cachedBase = base && typeof base.user === 'string' && Number.isInteger(base.version) && base.version > 0 &&
      typeof base.data === 'object' && base.data !== null
      ? { ...base, data: parseProgress(base.data) }
      : null;
  } catch {
    cachedBase = null;
  }
  return cachedBase;
}

function writeBase(base: Base | null): void {
  cachedBase = base;
  try {
    if (base) localStorage.setItem(BASE_KEY, JSON.stringify(base));
    else localStorage.removeItem(BASE_KEY);
  } catch {
    // Do not leave an older checkpoint pretending to be current after a restart. Recovery without
    // a base is conservative; this session still has the acknowledged base in memory.
    try { localStorage.removeItem(BASE_KEY); } catch { /* Storage is unavailable altogether. */ }
  }
}

/** After logging out: the next player on this device starts with no base. */
export function forgetCloudBase(): void {
  writeBase(null);
  setProgressOwner({ user: null, guest: true });
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
  if ((await supabase.auth.getSession()).data.session?.user.id !== user) return false;

  const local = parseProgress(progress);
  const remote = row ? parseProgress(row.data) : null;
  const owner = progressOwner();
  // An anonymous session created after losing login credentials does not make existing account
  // history independent guest progress. Preserve that provenance until an explicit fresh start.
  const guest = auth.session!.user.is_anonymous === true &&
    (owner?.guest === true || (owner === null && base?.user === user));
  const importingGuest = !base && owner?.guest === true && owner.user !== user;
  let next: Progress;
  if (!row) next = local;
  else if (!base && !importingGuest && sameProgress(local, remote!)) next = local;
  else if (base && row.version === base.version) {
    // Nobody else wrote: only this device's changes, if any.
    next = local;
  } else if (!base && !importingGuest) {
    // Missing/corrupt storage is not evidence of an independent guest: these may be two copies
    // of exactly the same history. Recover records without minting stars or counting wins twice.
    next = recoverProgress(local, remote!);
  } else {
    next = mergeProgress(base?.data ?? emptyProgress(), local, remote!);
  }

  if (importingGuest) {
    // Fold the guest into an account-owned local snapshot before uploading it. If storage is full,
    // do not start a transfer that a restart could mistake for a second independent guest import.
    setProgressOwner({ user, guest });
    if (!replaceProgress(next)) {
      setProgressOwner(owner!);
      replaceProgress(local);
      throw new CloudError('storage');
    }
    writeBase(row ? { user, version: row.version, data: remote! } : null);
    return false;
  }

  const version = (row?.version ?? 0) + 1;
  let savedVersion = version;
  if (row && sameProgress(next, remote!)) {
    savedVersion = row.version;
  } else if (row) {
    const write = await supabase
      .from('saves')
      .update({ data: next, version, updated_at: new Date().toISOString() })
      .eq('user_id', user)
      .eq('version', row.version)
      .select('version');
    if (write.error) {
      // A lost response can mean the write landed. Without an acknowledgement, adding the same
      // delta again is unsafe; the next sync must recover overlapping snapshots instead.
      writeBase(null);
      throw new CloudError(write.error.message);
    }
    if (write.data.length === 0) return false;
  } else {
    const write = await supabase.from('saves').insert({ user_id: user, data: next, version });
    // 23505: another device created it first.
    if (write.error?.code === '23505') return false;
    if (write.error) {
      writeBase(null);
      throw new CloudError(write.error.message);
    }
  }

  // An old account's response must not overwrite a fresh guest or a different signed-in account.
  if ((await supabase.auth.getSession()).data.session?.user.id !== user) return false;
  const ownerChanged = setProgressOwner({ user, guest });
  if (!sameProgress(next, local)) {
    // Play may have gone on while the request was out: keep that too.
    const current = parseProgress(progress);
    replaceProgress(sameProgress(current, local) ? next : mergeProgress(local, current, next));
    syncProfile();
  } else if (ownerChanged) {
    saveProgress();
  }
  writeBase({ user, version: savedVersion, data: next });
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
