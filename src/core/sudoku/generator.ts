import { createRng, shuffle } from '../rng.ts';
import { CELL_COUNT, type Grid } from './grid.ts';
import { countSolutions, solveRandom } from './solver.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Target number of given digits. Clue count is only a rough proxy for difficulty;
 * rating by the solving techniques a board needs can come later.
 */
export const CLUES: Record<Difficulty, number> = {
  easy: 40,
  medium: 32,
  hard: 26,
};

export interface Puzzle {
  seed: number;
  difficulty: Difficulty;
  /** Starting board: givens and zeros. */
  givens: Grid;
  /** The only solution of `givens`. */
  solution: Grid;
}

/**
 * Builds a puzzle with exactly one solution. Deterministic: the same seed and
 * difficulty always produce the same puzzle.
 */
export function generatePuzzle(seed: number, difficulty: Difficulty): Puzzle {
  const rng = createRng(seed);
  const solution = solveRandom(new Array<number>(CELL_COUNT).fill(0), rng);
  if (!solution) throw new Error('Failed to build a full board');

  const givens = [...solution];
  let clues = CELL_COUNT;
  const order = shuffle(Array.from({ length: CELL_COUNT }, (_, cell) => cell), rng);
  for (const cell of order) {
    if (clues <= CLUES[difficulty]) break;
    const digit = givens[cell];
    givens[cell] = 0;
    if (countSolutions(givens, 2) === 1) {
      clues--;
    } else {
      givens[cell] = digit;
    }
  }

  return { seed, difficulty, givens, solution };
}
