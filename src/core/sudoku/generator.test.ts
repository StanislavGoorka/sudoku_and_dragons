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
        const { givens, solution } = generatePuzzle(seed, difficulty);
        expect(isSolved(solution)).toBe(true);
        expect(givens.every((value, cell) => value === 0 || value === solution[cell])).toBe(true);
        expect(givens.filter((value) => value !== 0)).toHaveLength(CLUES[difficulty]);
        expect(countSolutions(givens)).toBe(1);
      }
    });
  }
});
