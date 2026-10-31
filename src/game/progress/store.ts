import { profileSuffix } from '../profile.ts';
import { emptyProgress, parseProgress, type Progress } from './progress.ts';

const STORAGE_KEY = `sudoku-dragons.progress${profileSuffix}`;

export interface ProgressOwner {
  /** Null until a new guest first signs in. */
  user: string | null;
  guest: boolean;
}

// Unknown for legacy saves. Losing the separate cloud-base key must not turn an account into a guest.
let owner: ProgressOwner | null = null;

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      owner = { user: null, guest: true };
      return emptyProgress();
    }
    const saved: unknown = JSON.parse(raw);
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
  let persisted = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...progress, _cloudOwner: owner }));
    persisted = true;
  } catch {
    // Keep playing; nothing else depends on the saved copy.
  }
  for (const listener of saveListeners) listener();
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

/** Called when the progress was replaced from outside the game (screens showing it may redraw). */
export function onProgressReplaced(listener: () => void): void {
  replaceListeners.push(listener);
}
