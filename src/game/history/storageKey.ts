import { profileSuffix } from '../profile.ts';

export const HISTORY_KEY = `sudoku-dragons.history${profileSuffix}`;
const listeners: (() => void)[] = [];
export function onHistoryCleared(listener: () => void): void { listeners.push(listener); }

export function clearHistoryData(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* Keep the in-memory view cleared. */ }
  for (const listener of listeners) listener();
}
