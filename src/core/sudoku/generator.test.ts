import { describe, expect, it } from 'vitest';
import { generatePuzzle, CLUES, type Difficulty } from './generator.ts';
import { isSolved } from './grid.ts';
import { countSolutions } from './solver.ts';

const SEEDS = [1, 2, 3, 42, 1234, 987654321];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

describe('generatePuzzle', () => {
  it('is deterministic for a seed', () => {
    expect(generatePuzzle(42, 'medium')).toEqual(generatePuzzle(42, 'medium'));
    expect(generatePuzzle(42, 'medium').givens).not.toEqual(generatePuzzle(43, 'medium').givens);
  });

  for (const difficulty of DIFFICULTIES) {
    it(`builds valid ${difficulty} puzzles with the target clue count`, () => {
      for (const seed of SEEDS) {
        const { givens, solution } = generatePuzzle(seed, difficulty, 1);
        expect(isSolved(solution)).toBe(true);
        expect(givens.every((value, cell) => value === 0 || value === solution[cell])).toBe(true);
        expect(givens.filter((value) => value !== 0)).toHaveLength(CLUES[difficulty]);
        expect(countSolutions(givens)).toBe(1);
      }
    });
  }
});

// Golden boards captured before v2: old saves and the live daily referee must reproduce these bytes.
const LEGACY_GOLDEN = {
  "easy": "867000091405090276200000348029000600070024050008569702004732905000901003900080020",
  "medium": "867000001405090270200000348029000600070024050008060700004730900000901000900080020",
  "hard": "807000001405090200000000348020000600070004050008060700000730900000901000900080020"
};
it('preserves the shipped v1 boards', () => {
  for (const d of DIFFICULTIES) expect(generatePuzzle(42, d, 1).givens.join('')).toBe(LEGACY_GOLDEN[d]);
});
