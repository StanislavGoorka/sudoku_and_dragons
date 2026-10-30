import { describe, expect, it } from 'vitest';
import { parseGrid } from '../sudoku/grid.ts';
import { createDuel, DUEL_RULES, forfeit, playDuelMove, timeoutTurn } from './duel.ts';

const SOLUTION = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');

/** The solved board with the given cells cleared. */
function boardWithout(...cells: number[]) {
  const board = [...SOLUTION];
  for (const cell of cells) board[cell] = 0;
  return board;
}

/** Cells 0..n-1 cleared: plenty of moves that complete nothing (row 0 stays open until its last cell). */
const OPEN = Array.from({ length: 30 }, (_, i) => i);
const MAX = DUEL_RULES.maxHp;

describe('duel', () => {
  it('starts with full HP and the given player on turn', () => {
    expect(createDuel(boardWithout(...OPEN), 1)).toMatchObject({
      hp: [DUEL_RULES.maxHp, DUEL_RULES.maxHp],
      turn: 1,
      movesLeft: DUEL_RULES.movesPerTurn,
      finished: false,
    });
  });

  it('rejects moves out of turn, on filled cells and out of range', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    expect(playDuelMove(duel, SOLUTION, 1, 0, 4)).toEqual({ ok: false, error: 'not-your-turn' });
    expect(playDuelMove(duel, SOLUTION, 0, 40, 6)).toEqual({ ok: false, error: 'occupied' });
    expect(playDuelMove(duel, SOLUTION, 0, 81, 1)).toEqual({ ok: false, error: 'bad-move' });
    expect(playDuelMove(duel, SOLUTION, 0, 0, 0)).toEqual({ ok: false, error: 'bad-move' });
    expect(playDuelMove(duel, SOLUTION, 0, 1.5, 4)).toEqual({ ok: false, error: 'bad-move' });
  });

  it('damages the other player by the digit played and passes the turn after three', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    expect(playDuelMove(duel, SOLUTION, 0, 0, 4)).toMatchObject({ ok: true, event: { kind: 'correct', damage: 4 } });
    expect(duel.hp).toEqual([MAX, MAX - 4]);
    playDuelMove(duel, SOLUTION, 0, 1, 8);
    expect(duel.hp).toEqual([MAX, MAX - 12]);
    expect(duel.movesLeft).toBe(1);
    playDuelMove(duel, SOLUTION, 0, 2, 3);
    expect(duel.turn).toBe(1);
    expect(duel.movesLeft).toBe(DUEL_RULES.movesPerTurn);
  });

  it('a completed row alone gives the extra move but no double damage', () => {
    // Cell 2 is the last gap of row 0; column 2 and box 0 stay open (cells 20 and 10).
    const duel = createDuel(boardWithout(2, 10, 20), 0);
    expect(playDuelMove(duel, SOLUTION, 0, 2, 3)).toMatchObject({ ok: true, event: { extraMove: true, damage: 3 } });
    expect(duel.movesLeft).toBe(DUEL_RULES.movesPerTurn);
  });

  it('gives an extra move for completing a unit, and double damage for closing a box', () => {
    // Cell 0 is the last gap of row 0, column 0 and box 0.
    const duel = createDuel(boardWithout(0, 80), 0);
    const result = playDuelMove(duel, SOLUTION, 0, 0, 4);
    expect(result).toMatchObject({ ok: true, event: { extraMove: true, damage: 8 } });
    expect(duel.turn).toBe(0);
    expect(duel.movesLeft).toBe(DUEL_RULES.movesPerTurn);
  });

  it('hurts the player who plays a wrong digit and ends their turn', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    expect(playDuelMove(duel, SOLUTION, 0, 0, 5)).toMatchObject({
      ok: true,
      event: { kind: 'wrong', damage: DUEL_RULES.mistakeDamage },
    });
    expect(duel.hp).toEqual([MAX - DUEL_RULES.mistakeDamage, MAX]);
    expect(duel.turn).toBe(1);
    expect(duel.board[0]).toBe(0);
  });

  it('is won by bringing the other player to 0 HP', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    duel.hp[1] = 3;
    playDuelMove(duel, SOLUTION, 0, 0, 4);
    playDuelMove(duel, SOLUTION, 0, 1, 8);
    expect(duel).toMatchObject({ finished: true, winner: 0, hp: [MAX, 0] });
    expect(playDuelMove(duel, SOLUTION, 0, 2, 3)).toEqual({ ok: false, error: 'finished' });
  });

  it('is lost by running out of HP through mistakes', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    duel.hp[0] = 5;
    playDuelMove(duel, SOLUTION, 0, 0, 5);
    expect(duel).toMatchObject({ finished: true, winner: 1, hp: [0, MAX] });
  });

  it('goes to the player with more HP when the board is full, or is drawn on equal HP', () => {
    const won = createDuel(boardWithout(80), 1);
    won.hp = [100, 120];
    playDuelMove(won, SOLUTION, 1, 80, 2);
    expect(won).toMatchObject({ finished: true, winner: 1 });

    const drawn = createDuel(boardWithout(80), 0);
    drawn.hp = [100, 104];
    // The last digit, a 2, closes box 8: 4 damage brings player 1 to 100 as well.
    playDuelMove(drawn, SOLUTION, 0, 80, 2);
    expect(drawn).toMatchObject({ finished: true, winner: null, hp: [100, 100] });
  });

  it('passes the turn on timeout and forfeits after too many in a row', () => {
    // Both players let the clock run out, turn after turn; player 0 runs out of allowance first.
    const duel = createDuel(boardWithout(...OPEN), 0);
    const events = Array.from({ length: DUEL_RULES.maxIdleTurns * 2 + 1 }, () => timeoutTurn(duel));
    expect(events.slice(0, 2)).toEqual([
      { kind: 'timeout', seat: 0 },
      { kind: 'timeout', seat: 1 },
    ]);
    expect(events.at(-1)).toEqual({ kind: 'forfeit', seat: 0 });
    expect(duel).toMatchObject({ finished: true, winner: 1 });
    expect(timeoutTurn(duel)).toBeNull();
  });

  it('resets the idle count when the player moves', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    timeoutTurn(duel);
    timeoutTurn(duel);
    expect(duel.idleTurns).toEqual([1, 1]);
    playDuelMove(duel, SOLUTION, 0, 0, 4);
    expect(duel.idleTurns).toEqual([0, 1]);
  });

  it('lets a player forfeit', () => {
    const duel = createDuel(boardWithout(...OPEN), 0);
    expect(forfeit(duel, 1)).toEqual({ kind: 'forfeit', seat: 1 });
    expect(duel).toMatchObject({ finished: true, winner: 0 });
    expect(forfeit(duel, 0)).toBeNull();
  });
});
