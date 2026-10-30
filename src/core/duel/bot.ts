import type { Rng } from '../rng.ts';
import type { Difficulty } from '../sudoku/generator.ts';
import { unitCells, unitsOf, type Grid } from '../sudoku/grid.ts';
import { closesBox, moveDamage } from '../battle/battle.ts';
import type { DuelState } from './duel.ts';

/** How a training bot plays: how often it slips, how long it thinks, and whether it plays tactically. */
export interface BotLevel {
  /** Chance that a digit is wrong. */
  mistakeRate: number;
  /** Milliseconds it thinks before each digit, picked between these. */
  thinkMs: [number, number];
  /** Goes for damage and keeps the rival from closing boxes; otherwise any empty cell. */
  smart: boolean;
}

/** One bot per board difficulty: the harder the board, the sharper and quicker the bot. */
export const BOT_LEVELS: Record<Difficulty, BotLevel> = {
  easy: { mistakeRate: 0.12, thinkMs: [2500, 5000], smart: false },
  medium: { mistakeRate: 0.07, thinkMs: [2000, 4000], smart: true },
  hard: { mistakeRate: 0.04, thinkMs: [1500, 3000], smart: true },
};

/** Empty cells of a unit. */
function gaps(board: Grid, cells: number[]): number {
  let count = 0;
  for (const cell of cells) if (board[cell] === 0) count++;
  return count;
}

/**
 * How good filling `cell` with its right digit is for the one who plays it: the damage it deals, a bonus
 * for an extra move (it completes a row, column or box), and a penalty for every box it leaves one gap
 * short, which the rival could close for double damage.
 */
export function moveScore(board: Grid, solution: Grid, cell: number): number {
  const digit = solution[cell];
  let completes = 0;
  let boxed = false;
  let gifts = 0;
  for (const unit of unitsOf(cell)) {
    const left = gaps(board, unitCells(unit)) - 1;
    if (left === 0) {
      completes++;
      if (unit.kind === 'box') boxed = true;
    } else if (left === 1 && unit.kind === 'box') {
      const last = unitCells(unit).find((other) => other !== cell && board[other] === 0)!;
      gifts += moveDamage(solution[last], true);
    }
  }
  return moveDamage(digit, boxed) + (completes > 0 ? 6 : 0) - gifts * 0.6;
}

/** The bot's next digit: a cell and a digit (wrong now and then, as its level says). */
export function botMove(state: DuelState, solution: Grid, level: BotLevel, rng: Rng): { cell: number; digit: number } {
  const empty = state.board.flatMap((value, cell) => (value === 0 ? [cell] : []));
  let cell = empty[Math.floor(rng() * empty.length)];
  if (level.smart) {
    let best = -Infinity;
    for (const candidate of empty) {
      // A little noise, so it does not play the same duel the same way twice.
      const score = moveScore(state.board, solution, candidate) + rng() * 2;
      if (score > best) {
        best = score;
        cell = candidate;
      }
    }
  }
  const slip = rng() < level.mistakeRate;
  return { cell, digit: slip ? (solution[cell] % 9) + 1 : solution[cell] };
}

/** Whether filling `cell` closes a box, for tests and callers that want to know without playing. */
export function wouldCloseBox(board: Grid, cell: number): boolean {
  return closesBox(unitsOf(cell).filter((unit) => gaps(board, unitCells(unit)) === 1));
}
