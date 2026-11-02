import { createRng, shuffle } from '../rng.ts';
import type { Grid } from './grid.ts';
import { generateLegacyPuzzle } from './legacyGenerator.ts';
import { analyzePuzzle, type LogicalAnalysis } from './logic.ts';
import { PUZZLE_BANK } from './puzzleBank.ts';
import { solve } from './solver.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GeneratorVersion = 1 | 2;
export const CURRENT_GENERATOR_VERSION: GeneratorVersion = 2;
export const GENERATION_ATTEMPTS = 12;
/** Target density, not the definition of difficulty. v1 used only these counts. */
export { CLUES } from './legacyGenerator.ts';
export interface Puzzle {
  seed: number;
  difficulty: Difficulty;
  /** Absent in checkpoints written before generator versioning: always v1. */
  generatorVersion?: GeneratorVersion;
  givens: Grid;
  solution: Grid;
  rating?: { difficulty: Difficulty; counts: LogicalAnalysis['counts'] };
  generation?: { attempts: number; fallback: boolean };
}

/** Same seed + difficulty + version => same board. Never upgrade an in-flight board implicitly. */
export function generatePuzzle(seed: number, difficulty: Difficulty, version: GeneratorVersion = CURRENT_GENERATOR_VERSION): Puzzle {
  validateRequest(seed, difficulty);
  if (version === 1) return generateLegacyPuzzle(seed, difficulty);
  if (version !== 2) throw new Error('Unsupported generator version');
  const rng = createRng(seed);
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateLegacyPuzzle(attempt === 0 ? seed : Math.floor(rng() * 2 ** 32), difficulty);
    const analysis = analyzePuzzle(candidate.givens);
    if (analysis.status === 'solved' && analysis.difficulty === difficulty) return {
      ...candidate, seed, generatorVersion: 2, rating: { difficulty, counts: analysis.counts },
      generation: { attempts: attempt + 1, fallback: false },
    };
  }
  return fallbackPuzzle(seed, difficulty);
}

function validateRequest(seed: number, difficulty: Difficulty): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid puzzle seed');
  if (!Object.hasOwn(PUZZLE_BANK, difficulty)) throw new Error('Invalid puzzle difficulty');
}

/** Seeded Sudoku symmetries retain uniqueness; re-rate after transformation to check the exact tier. */
export function fallbackPuzzle(seed: number, difficulty: Difficulty): Puzzle {
  validateRequest(seed, difficulty);
  const rng = createRng(seed ^ 0x6d2b79f5);
  const bank = PUZZLE_BANK[difficulty];
  const source = [...bank[Math.floor(rng() * bank.length)]].map(Number);
  const digits = [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)];
  const transpose = rng() < .5, flipRows = rng() < .5, flipCols = rng() < .5;
  let givens = source.map((_, cell) => {
    let r = Math.floor(cell / 9), c = cell % 9;
    if (transpose) [r, c] = [c, r];
    if (flipRows) r = 8 - r;
    if (flipCols) c = 8 - c;
    return digits[source[r * 9 + c]];
  });
  let analysis = analyzePuzzle(givens);
  // Exact bounded safety net if a future change to technique ordering changes the transformed rating.
  if (analysis.status !== 'solved' || analysis.difficulty !== difficulty) {
    givens = [...bank[0]].map(Number); analysis = analyzePuzzle(givens);
  }
  if (analysis.status !== 'solved' || analysis.difficulty !== difficulty) throw new Error('Invalid fallback puzzle bank');
  const solution = solve(givens);
  if (!solution) throw new Error('Unsolvable fallback');
  return { seed, difficulty, generatorVersion: 2, givens, solution,
    rating: { difficulty, counts: analysis.counts }, generation: { attempts: GENERATION_ATTEMPTS, fallback: true } };
}
