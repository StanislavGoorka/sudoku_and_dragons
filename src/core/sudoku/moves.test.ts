import { describe, expect, it } from 'vitest';
import { parseGrid } from './grid.ts';
import { applyMove } from './moves.ts';

const SOLUTION = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');

/** The solved board with the given cells cleared. */
function boardWithout(...cells: number[]) {
  const board = [...SOLUTION];
  for (const cell of cells) board[cell] = 0;
  return board;
}

describe('applyMove', () => {
  it('writes a correct digit', () => {
    const board = boardWithout(0, 80);
    const result = applyMove(board, SOLUTION, 0, 4);
    expect(result.kind).toBe('correct');
    expect(board[0]).toBe(4);
  });

  it('rejects a wrong digit without writing it', () => {
    const board = boardWithout(0);
    expect(applyMove(board, SOLUTION, 0, 7)).toEqual({ kind: 'wrong', expected: 4 });
    expect(board[0]).toBe(0);
  });

  it('rejects a move on a filled cell', () => {
    expect(applyMove(boardWithout(0), SOLUTION, 1, 8)).toEqual({ kind: 'occupied' });
  });

  it('reports every unit the move completed', () => {
    // Cell 0 is the last gap in row 0, column 0 and box 0; cell 80 keeps the board unsolved.
    const result = applyMove(boardWithout(0, 80), SOLUTION, 0, 4);
    expect(result).toEqual({
      kind: 'correct',
      digit: 4,
      completed: [
        { kind: 'row', index: 0 },
        { kind: 'col', index: 0 },
        { kind: 'box', index: 0 },
      ],
      solved: false,
    });
  });

  it('reports only units that are actually full', () => {
    // Cell 1 is also empty, so row 0 and box 0 stay open; column 0 completes.
    const result = applyMove(boardWithout(0, 1), SOLUTION, 0, 4);
    expect(result).toMatchObject({ completed: [{ kind: 'col', index: 0 }], solved: false });
  });

  it('flags the move that solves the board', () => {
    expect(applyMove(boardWithout(80), SOLUTION, 80, 2)).toMatchObject({ solved: true });
  });
});
