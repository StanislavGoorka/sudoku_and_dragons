import { closesBox, moveDamage } from '../battle/battle.ts';
import { CELL_COUNT, type Grid, type Unit } from '../sudoku/grid.ts';
import { applyMove } from '../sudoku/moves.ts';

/** A player's place in a duel: 0 created it (or waited in the queue), 1 joined. */
export type Seat = 0 | 1;

export const DUEL_RULES = {
  maxHp: 130,
  /** Correct digits per turn. A digit that completes a row, column or box does not use one up. */
  movesPerTurn: 3,
  /** Time for one turn; the server enforces it. */
  turnSeconds: 30,
  /** HP a wrong digit costs its own player; it also ends the turn. */
  mistakeDamage: 10,
  /** Turns in a row a player may let run out; one more and they forfeit. */
  maxIdleTurns: 2,
} as const;

/**
 * Everything both players may see. The solution is not here: the server keeps it, checks every
 * digit against it, and sends only the result.
 */
export interface DuelState {
  /** The shared board: givens plus every correct digit played so far. */
  board: Grid;
  hp: [number, number];
  turn: Seat;
  movesLeft: number;
  /** Turns each player has let run out in a row. */
  idleTurns: [number, number];
  finished: boolean;
  /** Set when finished; null for a draw (board full with equal HP). */
  winner: Seat | null;
}

export type DuelEvent =
  | {
      kind: 'correct';
      seat: Seat;
      cell: number;
      digit: number;
      completed: Unit[];
      /** Damage dealt to the other player. */
      damage: number;
      /** Completing a unit keeps the move. */
      extraMove: boolean;
    }
  | { kind: 'wrong'; seat: Seat; cell: number; digit: number; damage: number }
  | { kind: 'timeout'; seat: Seat }
  | { kind: 'forfeit'; seat: Seat };

export type DuelError = 'finished' | 'not-your-turn' | 'occupied' | 'bad-move';

export type DuelMoveResult = { ok: true; event: DuelEvent } | { ok: false; error: DuelError };

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function createDuel(givens: Grid, firstTurn: Seat): DuelState {
  return {
    board: [...givens],
    hp: [DUEL_RULES.maxHp, DUEL_RULES.maxHp],
    turn: firstTurn,
    movesLeft: DUEL_RULES.movesPerTurn,
    idleTurns: [0, 0],
    finished: false,
    winner: null,
  };
}

function passTurn(state: DuelState): void {
  state.turn = otherSeat(state.turn);
  state.movesLeft = DUEL_RULES.movesPerTurn;
}

function finish(state: DuelState, winner: Seat | null): void {
  state.finished = true;
  state.winner = winner;
}

/** Plays `digit` in `cell` for `seat`, checking it against `solution`. Mutates `state`. */
export function playDuelMove(
  state: DuelState,
  solution: Grid,
  seat: Seat,
  cell: number,
  digit: number,
): DuelMoveResult {
  if (state.finished) return { ok: false, error: 'finished' };
  if (seat !== state.turn) return { ok: false, error: 'not-your-turn' };
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || !Number.isInteger(digit) || digit < 1 || digit > 9) {
    return { ok: false, error: 'bad-move' };
  }

  const move = applyMove(state.board, solution, cell, digit);
  if (move.kind === 'occupied') return { ok: false, error: 'occupied' };
  state.idleTurns[seat] = 0;
  const other = otherSeat(seat);

  if (move.kind === 'wrong') {
    const damage = Math.min(DUEL_RULES.mistakeDamage, state.hp[seat]);
    state.hp[seat] -= damage;
    if (state.hp[seat] === 0) {
      finish(state, other);
    } else {
      passTurn(state);
    }
    return { ok: true, event: { kind: 'wrong', seat, cell, digit, damage } };
  }

  const units = move.completed.length;
  const damage = Math.min(moveDamage(digit, closesBox(move.completed)), state.hp[other]);
  state.hp[other] -= damage;
  const extraMove = units > 0;
  if (state.hp[other] === 0) {
    finish(state, seat);
  } else if (move.solved) {
    const [a, b] = state.hp;
    finish(state, a === b ? null : a > b ? 0 : 1);
  } else if (!extraMove) {
    state.movesLeft--;
    if (state.movesLeft === 0) passTurn(state);
  }
  return { ok: true, event: { kind: 'correct', seat, cell, digit, completed: move.completed, damage, extraMove } };
}

/** The player on turn let their time run out: the turn passes, or they forfeit after too many. */
export function timeoutTurn(state: DuelState): DuelEvent | null {
  if (state.finished) return null;
  const seat = state.turn;
  state.idleTurns[seat]++;
  if (state.idleTurns[seat] > DUEL_RULES.maxIdleTurns) {
    finish(state, otherSeat(seat));
    return { kind: 'forfeit', seat };
  }
  passTurn(state);
  return { kind: 'timeout', seat };
}

/** `seat` leaves the duel and loses it. */
export function forfeit(state: DuelState, seat: Seat): DuelEvent | null {
  if (state.finished) return null;
  finish(state, otherSeat(seat));
  return { kind: 'forfeit', seat };
}
