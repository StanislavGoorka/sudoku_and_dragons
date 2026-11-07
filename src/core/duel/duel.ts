import { closesBox, moveDamage } from '../battle/battle.ts';
import { CELL_COUNT, type Grid, type Unit } from '../sudoku/grid.ts';
import { applyMove } from '../sudoku/moves.ts';
import { ARENA_FOCUS, type ArenaFighter, type HeroClass } from './classes.ts';

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
  /** Absent in classic duels, lessons and older checkpoints. */
  heroes?: [ArenaFighter, ArenaFighter];
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
      healed?: number;
    }
  | { kind: 'wrong'; seat: Seat; cell: number; digit: number; damage: number }
  | { kind: 'skill'; seat: Seat; id: HeroClass; healed: number }
  | { kind: 'timeout'; seat: Seat }
  | { kind: 'forfeit'; seat: Seat };

export type DuelError = 'finished' | 'not-your-turn' | 'occupied' | 'bad-move' | 'skill-unavailable';

export type DuelMoveResult = { ok: true; event: DuelEvent } | { ok: false; error: DuelError };

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function createDuel(givens: Grid, firstTurn: Seat, heroes?: [ArenaFighter, ArenaFighter]): DuelState {
  return {
    board: [...givens],
    hp: heroes ? [heroes[0].maxHp, heroes[1].maxHp] : [DUEL_RULES.maxHp, DUEL_RULES.maxHp],
    turn: firstTurn,
    movesLeft: DUEL_RULES.movesPerTurn,
    idleTurns: [0, 0],
    finished: false,
    winner: null,
    ...(heroes ? { heroes } : {}),
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
  const hero = state.heroes?.[seat];
  const rival = state.heroes?.[other];

  if (move.kind === 'wrong') {
    let raw: number = DUEL_RULES.mistakeDamage;
    if (hero?.id === 'guardian') raw -= 2;
    if (hero?.id === 'ranger' && hero.guarded) { raw -= 6; hero.guarded = false; }
    const damage = Math.min(raw, state.hp[seat]);
    state.hp[seat] -= damage;
    if (state.hp[seat] === 0) {
      finish(state, other);
    } else {
      passTurn(state);
    }
    return { ok: true, event: { kind: 'wrong', seat, cell, digit, damage } };
  }

  const units = move.completed.length;
  let raw = moveDamage(digit, closesBox(move.completed));
  if (rival?.id === 'guardian' && rival.guarded) { raw = Math.max(0, raw - 6); rival.guarded = false; }
  const damage = Math.min(raw, state.hp[other]);
  state.hp[other] -= damage;
  let healed = 0;
  if (hero) {
    hero.correct++;
    hero.focus = Math.min(ARENA_FOCUS, hero.focus + (hero.id === 'ranger' || units > 0 ? 2 : 1));
    if (hero.id === 'alchemist' && units > 0 && state.hp[seat] < hero.maxHp) { state.hp[seat]++; healed = 1; }
  }
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
  return { ok: true, event: { kind: 'correct', seat, cell, digit, completed: move.completed, damage, extraMove, ...(healed ? { healed } : {}) } };
}

export function canUseArenaSkill(state: DuelState, seat: Seat): boolean {
  const h = state.heroes?.[seat];
  return !!h && !state.finished && state.turn === seat && h.focus === ARENA_FOCUS &&
    (h.id === 'alchemist' ? state.hp[seat] < h.maxHp : !h.guarded);
}

/** A skill consumes focus but neither places a digit nor changes the turn or its deadline. */
export function useArenaSkill(state: DuelState, seat: Seat): DuelMoveResult {
  if (!canUseArenaSkill(state, seat)) return { ok: false, error: 'skill-unavailable' };
  const h = state.heroes![seat];
  h.focus = 0;
  const healed = h.id === 'alchemist' ? Math.min(8, h.maxHp - state.hp[seat]) : 0;
  if (h.id === 'alchemist') state.hp[seat] += healed;
  else h.guarded = true;
  return { ok: true, event: { kind: 'skill', id: h.id, seat, healed } };
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
