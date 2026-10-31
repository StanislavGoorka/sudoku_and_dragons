import { profileSuffix } from '../profile.ts';
import { emptyProgress, parseProgress, recordDuel, type Progress, type Reward } from './progress.ts';
import { parseSavedBattle, type SavedBattle } from './battleSave.ts';
import { reportDiagnostic } from '../diagnostics/index.ts';

const STORAGE_KEY = `sudoku-dragons.progress${profileSuffix}`;

export interface ProgressOwner {
  /** Null until a new guest first signs in. */
  user: string | null;
  guest: boolean;
}

// Unknown for legacy saves. Losing the separate cloud-base key must not turn an account into a guest.
let owner: ProgressOwner | null = null;
let battle: SavedBattle | null = null;
let duelResults = new Set<string>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      owner = { user: null, guest: true };
      return emptyProgress();
    }
    const saved: unknown = JSON.parse(raw);
    battle = parseSavedBattle((saved as { _soloBattle?: unknown } | null)?._soloBattle);
    const results = (saved as { _duelResults?: unknown } | null)?._duelResults;
    if (Array.isArray(results)) duelResults = new Set(results.filter((id): id is string => typeof id === 'string'));
    const candidate = (saved as { _cloudOwner?: ProgressOwner } | null)?._cloudOwner;
    if (candidate && (candidate.user === null || typeof candidate.user === 'string') && typeof candidate.guest === 'boolean') {
      owner = { user: candidate.user, guest: candidate.guest };
    }
    return parseProgress(saved);
  } catch {
    return emptyProgress();
  }
}

/** The player's progress, loaded once at start. Change it with the functions in progress.ts, then save. */
export const progress: Progress = load();

export function activeBattle(): SavedBattle | null {
  return battle;
}

/** Quiet checkpoints do not upload progress every second. */
export function saveActiveBattle(next: SavedBattle | null): boolean {
  battle = next;
  return persist();
}

/** A restarted end screen cannot count the same online result again. Receipt and reward are atomic. */
export function recordDuelOnce(user: string, id: string, won: boolean): Reward | null {
  const key = `${user}:${id}`;
  if (duelResults.has(key)) return null;
  duelResults.add(key);
  const reward = recordDuel(progress, won);
  saveProgress();
  return reward;
}

export function progressOwner(): ProgressOwner | null {
  return owner;
}

/** Metadata is persisted together with progress by the next save, never in a separate storage write. */
export function setProgressOwner(next: ProgressOwner): boolean {
  if (owner?.user === next.user && owner.guest === next.guest) return false;
  owner = { ...next };
  return true;
}

const saveListeners: (() => void)[] = [];
const replaceListeners: (() => void)[] = [];

/** Storage can be missing or full; progress then lasts until the app closes. */
export function saveProgress(): boolean {
  const persisted = persist();
  for (const listener of saveListeners) listener();
  return persisted;
}

function persist(): boolean {
  let persisted = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...progress, _cloudOwner: owner, _soloBattle: battle, _duelResults: [...duelResults] }));
    persisted = true;
  } catch (error) {
    // Keep playing; nothing else depends on the saved copy.
    reportDiagnostic('storage', 'storage_write', error);
  }
  return persisted;
}

/** Called after every save (the cloud save follows it). */
export function onProgressSaved(listener: () => void): void {
  saveListeners.push(listener);
}

/**
 * Puts other progress in place of this one (merged with the cloud, or a fresh start after logging
 * out) and saves it. The object stays the same, so screens holding it see the new values.
 */
export function replaceProgress(next: Progress): boolean {
  Object.assign(progress, parseProgress(next));
  const persisted = saveProgress();
  for (const listener of replaceListeners) listener();
  return persisted;
}

/** Explicit account/data deletion also clears receipts and the local battle, even if writes are full. */
export function clearLocalProgress(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage is unavailable. */ }
  battle = null;
  duelResults.clear();
  owner = { user: null, guest: true };
  replaceProgress(emptyProgress());
}

/** Called when the progress was replaced from outside the game (screens showing it may redraw). */
export function onProgressReplaced(listener: () => void): void {
  replaceListeners.push(listener);
}
