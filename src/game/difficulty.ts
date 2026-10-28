import type { Difficulty } from '../core/index.ts';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_INFO: Record<Difficulty, { name: string; tagline: string }> = {
  easy: { name: 'Łatwy', tagline: 'na rozgrzewkę' },
  medium: { name: 'Średni', tagline: 'dla wprawionych' },
  hard: { name: 'Trudny', tagline: 'tylko dla mistrzów' },
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
