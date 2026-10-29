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

/** Storage can be missing or full; progress then lasts until the app closes. */
export function saveProgress(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Keep playing; nothing else depends on the saved copy.
  }
}
