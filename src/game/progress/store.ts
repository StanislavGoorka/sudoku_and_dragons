import { profileSuffix } from '../profile.ts';
import { emptyProgress, parseProgress, type Progress } from './progress.ts';

const STORAGE_KEY = `sudoku-dragons.progress${profileSuffix}`;

function load(): Progress {
  try {
    return parseProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return emptyProgress();
  }
}

/** The player's progress, loaded once at start. Change it with the functions in progress.ts, then save. */
export const progress: Progress = load();

const saveListeners: (() => void)[] = [];
const replaceListeners: (() => void)[] = [];

/** Storage can be missing or full; progress then lasts until the app closes. */
export function saveProgress(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Keep playing; nothing else depends on the saved copy.
  }
  for (const listener of saveListeners) listener();
}

/** Called after every save (the cloud save follows it). */
export function onProgressSaved(listener: () => void): void {
  saveListeners.push(listener);
}

/**
 * Puts other progress in place of this one (merged with the cloud, or a fresh start after logging
 * out) and saves it. The object stays the same, so screens holding it see the new values.
 */
export function replaceProgress(next: Progress): void {
  Object.assign(progress, parseProgress(next));
  saveProgress();
  for (const listener of replaceListeners) listener();
}

/** Called when the progress was replaced from outside the game (screens showing it may redraw). */
export function onProgressReplaced(listener: () => void): void {
  replaceListeners.push(listener);
}
