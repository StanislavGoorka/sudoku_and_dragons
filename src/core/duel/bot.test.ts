import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { generatePuzzle } from '../sudoku/generator.ts';
import { parseGrid } from '../sudoku/grid.ts';
import { BOT_LEVELS, botMove, moveScore, wouldCloseBox } from './bot.ts';
import { createDuel, playDuelMove } from './duel.ts';

const SOLUTION = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
const PERFECT = { mistakeRate: 0, thinkMs: [0, 0] as [number, number], smart: true };

function boardWithout(...cells: number[]) {
  const board = [...SOLUTION];
  for (const cell of cells) board[cell] = 0;
  return board;
}

describe('duel bot', () => {
  it('plays an empty cell, with the right digit when it does not slip', () => {
    const { givens, solution } = generatePuzzle(7, 'medium');
    const duel = createDuel(givens, 1);
    const rng = createRng(1);
    for (let i = 0; i < 20; i++) {
      const { cell, digit } = botMove(duel, solution, PERFECT, rng);
      expect(duel.board[cell]).toBe(0);
      expect(digit).toBe(solution[cell]);
      duel.board[cell] = digit;
    }
  });

  it('a smart bot closes a box with a big digit rather than play a small one', () => {
    // Cell 0 (a 4) closes box 0; cell 80 (a 2) closes nothing, since 79 is open too.
    const duel = createDuel(boardWithout(0, 79, 80), 1);
    expect(wouldCloseBox(duel.board, 0)).toBe(true);
    expect(moveScore(duel.board, SOLUTION, 0)).toBeGreaterThan(moveScore(duel.board, SOLUTION, 80));
    expect(botMove(duel, SOLUTION, PERFECT, createRng(3)).cell).toBe(0);
  });

  it('a smart bot avoids leaving the rival a box one gap short', () => {
    // Box 8 has cells 70 and 80 open: filling either leaves the other for the rival to close.
    const board = boardWithout(70, 80, 3, 4);
    expect(moveScore(board, SOLUTION, 70)).toBeLessThan(moveScore(board, SOLUTION, 3) + 1);
  });

  it('slips about as often as its level says', () => {
    const { givens, solution } = generatePuzzle(9, 'easy');
    const duel = createDuel(givens, 1);
    const rng = createRng(5);
    let wrong = 0;
    for (let i = 0; i < 2000; i++) {
      const { cell, digit } = botMove(duel, solution, BOT_LEVELS.easy, rng);
      if (digit !== solution[cell]) wrong++;
    }
    expect(wrong / 2000).toBeGreaterThan(0.08);
    expect(wrong / 2000).toBeLessThan(0.16);
  });

  it('can play a whole duel to the end', () => {
    const { givens, solution } = generatePuzzle(11, 'hard');
    const duel = createDuel(givens, 0);
    const rng = createRng(11);
    for (let i = 0; i < 500 && !duel.finished; i++) {
      const { cell, digit } = botMove(duel, solution, BOT_LEVELS.hard, rng);
      expect(playDuelMove(duel, solution, duel.turn, cell, digit).ok).toBe(true);
    }
    expect(duel.finished).toBe(true);
  });
});
