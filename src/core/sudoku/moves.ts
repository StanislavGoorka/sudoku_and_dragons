import { unitCells, unitsOf, type Grid, type Unit } from './grid.ts';

export type MoveResult =
  | {
      kind: 'correct';
      /** Units (row, column, box) this move filled up — the hook for RPG effects. */
      completed: Unit[];
      /** True when this move finished the whole board. */
      solved: boolean;
    }
  | { kind: 'wrong'; expected: number }
  | { kind: 'occupied' };

/**
 * Checks a digit against the solution and, if correct, writes it into `board`.
 * A wrong digit is not written.
 */
export function applyMove(board: Grid, solution: Grid, cell: number, digit: number): MoveResult {
  if (board[cell] !== 0) return { kind: 'occupied' };
  const expected = solution[cell];
  if (digit !== expected) return { kind: 'wrong', expected };

  board[cell] = digit;
  const completed = unitsOf(cell).filter((unit) => unitCells(unit).every((other) => board[other] !== 0));
  return { kind: 'correct', completed, solved: !board.includes(0) };
}
