import { createRng, shuffle } from '../rng.ts';
import { CELL_COUNT, type Grid } from './grid.ts';
import { countSolutions, solveRandom } from './solver.ts';

import type { Difficulty, Puzzle } from './generator.ts';

/**
 * Shipped v1 target densities. Frozen for checkpoints and the existing daily protocol.
 * Version 2 applies a logical-technique rating as well (generator.ts).
 */
export const CLUES: Record<Difficulty, number> = {
  easy: 40,
  medium: 32,
  hard: 26,
};



/**
 * Builds a puzzle with exactly one solution. Deterministic: the same seed and
 * difficulty always produce the same puzzle.
 */
export function generateLegacyPuzzle(seed: number, difficulty: Difficulty): Puzzle {
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

  return { seed, difficulty, givens, solution, generatorVersion: 1 };
}
