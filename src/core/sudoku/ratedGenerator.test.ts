import { describe, expect, it } from 'vitest';
import { generatePuzzle, fallbackPuzzle, GENERATION_ATTEMPTS, CLUES, type Difficulty } from './generator.ts';
import { analyzePuzzle } from './logic.ts';
import { isSolved } from './grid.ts';
import { countSolutions } from './solver.ts';

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];
describe('rated generator v2 quality corpus', () => {
  for (const difficulty of LEVELS) it(`checks 1000 ${difficulty} seeds for uniqueness, logical tier and exact solution`, () => {
    const boards = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const puzzle = generatePuzzle(seed, difficulty, 2);
      const analysis = analyzePuzzle(puzzle.givens);
      expect(puzzle.generatorVersion).toBe(2);
      expect(countSolutions(puzzle.givens), `uniqueness ${difficulty}/${seed}`).toBe(1);
      expect(isSolved(puzzle.solution)).toBe(true);
      expect(analysis.status).toBe('solved');
      expect(analysis.difficulty, `rating ${difficulty}/${seed}`).toBe(difficulty);
      expect(analysis.grid).toEqual(puzzle.solution);
      expect(puzzle.generation!.attempts).toBeLessThanOrEqual(GENERATION_ATTEMPTS);
      expect(puzzle.givens.filter(Boolean).length).toBeGreaterThanOrEqual(CLUES[difficulty]);
      if (difficulty !== 'easy') expect(analyzePuzzle(puzzle.givens, difficulty === 'hard' ? 'medium' : 'easy').status).toBe('stalled');
      boards.add(puzzle.givens.join(''));
    }
    expect(boards.size).toBe(1000);
  }, 120_000);

  for (const difficulty of LEVELS) it(`forces and validates the deterministic ${difficulty} fallback`, () => {
    const boards = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const p = fallbackPuzzle(seed, difficulty);
      expect(p.generation!.fallback).toBe(true);
      expect(countSolutions(p.givens)).toBe(1);
      expect(analyzePuzzle(p.givens).difficulty).toBe(difficulty);
      expect(analyzePuzzle(p.givens).grid).toEqual(p.solution);
      boards.add(p.givens.join(''));
    }
    expect(boards.size).toBeGreaterThan(990);
    expect(fallbackPuzzle(0xffffffff, difficulty)).toEqual(fallbackPuzzle(0xffffffff, difficulty));
  }, 30_000);

  it('is deterministic in each supported version, including zero and the maximum seed', () => {
    for (const version of [1, 2] as const) for (const difficulty of LEVELS) for (const seed of [0, 42, 0xffffffff]) {
      expect(generatePuzzle(seed, difficulty, version)).toEqual(generatePuzzle(seed, difficulty, version));
    }
    expect(generatePuzzle(42, 'hard', 1).givens).not.toEqual(generatePuzzle(42, 'hard', 2).givens);
  });
  it('rejects unsupported versions, malformed seeds and levels', () => {
    for (const seed of [-1, NaN, Infinity, 1.5, 0x100000000]) expect(() => generatePuzzle(seed, 'easy')).toThrow();
    expect(() => generatePuzzle(1, 'easy', 3 as 2)).toThrow();
    expect(() => generatePuzzle(1, 'unknown' as Difficulty)).toThrow();
  });
});
