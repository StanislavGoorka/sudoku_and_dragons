import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../core/index.ts';
import { easyCell } from './tutorial.ts';

describe('the tutorial', () => {
  it('suggests an empty cell where only one digit fits', () => {
    const { givens, solution } = generatePuzzle(4242, 'easy');
    const cell = easyCell(givens);
    expect(givens[cell]).toBe(0);
    const row = Math.floor(cell / 9);
    const col = cell % 9;
    const fitting = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => {
      for (let k = 0; k < 9; k++) {
        const box = (Math.floor(row / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(col / 3) * 3 + (k % 3);
        if (givens[row * 9 + k] === digit || givens[k * 9 + col] === digit || givens[box] === digit) return false;
      }
      return true;
    });
    expect(fitting).toEqual([solution[cell]]);
  });

  it('falls back to any empty cell', () => {
    const grid = new Array<number>(81).fill(0);
    expect(grid[easyCell(grid)]).toBe(0);
  });
});
