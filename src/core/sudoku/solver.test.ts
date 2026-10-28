import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { CELL_COUNT, formatGrid, isSolved, parseGrid } from './grid.ts';
import { countSolutions, solve, solveRandom } from './solver.ts';

// Project Euler #96, grid 01.
const PUZZLE = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
const SOLUTION = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

const empty = () => new Array<number>(CELL_COUNT).fill(0);

describe('solver', () => {
  it('solves a known puzzle', () => {
    const solution = solve(parseGrid(PUZZLE));
    expect(solution && formatGrid(solution)).toBe(SOLUTION);
  });

  it('finds a unique solution for a proper puzzle', () => {
    expect(countSolutions(parseGrid(PUZZLE))).toBe(1);
  });

  it('stops counting at the limit', () => {
    expect(countSolutions(empty(), 2)).toBe(2);
    expect(countSolutions(empty(), 5)).toBe(5);
  });

  it('returns null when givens conflict', () => {
    const grid = empty();
    grid[0] = 5;
    grid[8] = 5;
    expect(solve(grid)).toBeNull();
    expect(countSolutions(grid)).toBe(0);
  });

  it('returns null for an unsolvable board without direct conflicts', () => {
    // Row 0 needs a 9 in cell 8, but column 8 already has a 9.
    const grid = parseGrid('12345678.' + '........9' + '.'.repeat(63));
    expect(solve(grid)).toBeNull();
  });

  it('does not modify its input', () => {
    const grid = parseGrid(PUZZLE);
    solve(grid);
    expect(formatGrid(grid)).toBe(formatGrid(parseGrid(PUZZLE)));
  });

  it('builds random full boards reproducibly', () => {
    const a = solveRandom(empty(), createRng(7));
    const b = solveRandom(empty(), createRng(7));
    const c = solveRandom(empty(), createRng(8));
    expect(a && isSolved(a)).toBe(true);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
