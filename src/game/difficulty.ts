import type { Difficulty } from '../core/index.ts';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_INFO: Record<Difficulty, { name: string }> = {
  easy: { name: 'Łatwy' },
  medium: { name: 'Średni' },
  hard: { name: 'Trudny' },
};

const STORAGE_KEY = 'sudoku-dragons.difficulty';

/** The difficulty picked last time, or easy. Storage can be missing or blocked, so failures fall back quietly. */
export function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return DIFFICULTIES.find((d) => d === saved) ?? 'easy';
  } catch {
    return 'easy';
  }
}

export function saveDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem(STORAGE_KEY, difficulty);
  } catch {
    // Remembering the choice is a convenience; the game works without it.
  }
}

const STAGE_KEY = 'sudoku-dragons.stage';

/** The campaign stage played last (its id), for the menu to show first; null if none or unknown. */
export function loadStageId(): string | null {
  try {
    return localStorage.getItem(STAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStageId(id: string): void {
  try {
    localStorage.setItem(STAGE_KEY, id);
  } catch {
    // A convenience, like the difficulty.
  }
}
