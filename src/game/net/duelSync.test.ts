import { describe, expect, it } from 'vitest';
import { createDuel, DUEL_RULES, generatePuzzle, playDuelMove, solve, timeoutTurn, type DuelState } from '../../core/index.ts';
import { CLAIM_DELAY_MS, DuelSync, sameValue, type ServerVersion } from './duelSync.ts';

const puzzle = generatePuzzle(7, 'easy');
const solution = solve(puzzle.givens)!;
const empty = puzzle.givens.flatMap((digit, cell) => (digit === 0 ? [cell] : []));
const wrongDigit = (cell: number) => (solution[cell] % 9) + 1;
const START = 1_000_000;
const TURN_MS = DUEL_RULES.turnSeconds * 1000;

function freshSync(turn: 0 | 1 = 0): DuelSync {
  return new DuelSync({ state: createDuel(puzzle.givens, turn), version: 1, turnStartedAt: START }, 0, solution);
}

/** What the server would send after playing the same move on its own copy. */
function serverMove(base: DuelState, version: number, seat: 0 | 1, cell: number, digit: number): ServerVersion {
  const state = structuredClone(base);
  const result = playDuelMove(state, puzzle.solution, seat, cell, digit);
  if (!result.ok) throw new Error(result.error);
  return { state, version, turnStartedAt: START, event: result.event };
}

describe('DuelSync', () => {
  it('solving the shared board locally gives the server solution', () => {
    expect(solution).toEqual(puzzle.solution);
  });

  it('predicts own moves at once and confirms them silently', () => {
    const sync = freshSync();
    const play = sync.play(empty[0], solution[empty[0]], START + 1000);
    expect(play.ok).toBe(true);
    expect(sync.shown.state.board[empty[0]]).toBe(solution[empty[0]]);
    expect(sync.shown.version).toBe(2);
    expect(sync.confirmed.version).toBe(1);

    const row = serverMove(sync.confirmed.state, 2, 0, empty[0], solution[empty[0]]);
    expect(sync.receive(row).kind).toBe('confirmed');
    expect(sync.predictions).toHaveLength(0);
    expect(sync.shown.state).toEqual(row.state);
  });

  it('predicts a wrong digit as a mistake that passes the turn', () => {
    const sync = freshSync();
    const play = sync.play(empty[0], wrongDigit(empty[0]), START + 1000);
    expect(play.ok && play.prediction.event.kind).toBe('wrong');
    expect(sync.shown.state.hp[0]).toBe(DUEL_RULES.maxHp - DUEL_RULES.mistakeDamage);
    expect(sync.shown.state.turn).toBe(1);
    expect(sync.shown.turnStartedAt).toBe(START + 1000);
  });

  it('refuses moves the rules forbid without predicting anything', () => {
    const sync = freshSync(1);
    expect(sync.play(empty[0], solution[empty[0]], START)).toEqual({ ok: false, error: 'not-your-turn' });
    expect(sync.predictions).toHaveLength(0);
  });

  it('sends one prediction at a time, in order', () => {
    const sync = freshSync();
    sync.play(empty[0], solution[empty[0]], START);
    sync.play(empty[1], solution[empty[1]], START);
    const first = sync.nextToSend()!;
    expect(first.action).toEqual({ kind: 'move', cell: empty[0], digit: solution[empty[0]] });
    first.sent = true;
    expect(sync.nextToSend()).toBeNull();
    sync.receive(serverMove(sync.confirmed.state, 2, 0, empty[0], solution[empty[0]]));
    expect(sync.nextToSend()?.action).toEqual({ kind: 'move', cell: empty[1], digit: solution[empty[1]] });
  });

  it('confirms several predictions when a later version arrives first', () => {
    const sync = freshSync();
    sync.play(empty[0], solution[empty[0]], START);
    sync.play(empty[1], solution[empty[1]], START);
    const one = serverMove(sync.confirmed.state, 2, 0, empty[0], solution[empty[0]]);
    const two = serverMove(one.state, 3, 0, empty[1], solution[empty[1]]);
    expect(sync.receive(two).kind).toBe('confirmed');
    expect(sync.predictions).toHaveLength(0);
    expect(sync.receive(one).kind).toBe('stale');
  });

  it('drops the predictions when the server says something else', () => {
    const sync = freshSync();
    sync.play(empty[0], solution[empty[0]], START);
    // The rival claimed the turn first.
    const state = structuredClone(sync.confirmed.state);
    const event = timeoutTurn(state);
    const received = sync.receive({ state, version: 2, turnStartedAt: START + TURN_MS, event });
    expect(received.kind).toBe('unexpected');
    if (received.kind !== 'unexpected') return;
    expect(received.next).toBe(true);
    expect(received.dropped.map((p) => p.action.kind)).toEqual(['move']);
    expect(received.before.version).toBe(1);
    expect(sync.shown.state.board[empty[0]]).toBe(0);
    expect(sync.shown.state.turn).toBe(1);
  });

  it('predicts a timeout once the deadline passes, and claims it a moment later', () => {
    const sync = freshSync();
    expect(sync.expire(START + TURN_MS - 1)).toBeNull();
    const timeout = sync.expire(START + TURN_MS)!;
    expect(timeout.event).toEqual({ kind: 'timeout', seat: 0 });
    expect(sync.shown.state.turn).toBe(1);
    expect(sync.shown.turnStartedAt).toBe(START + TURN_MS);
    expect(timeout.sendAt).toBe(START + TURN_MS + CLAIM_DELAY_MS);
    // Only one timeout is predicted until the server confirms it.
    expect(sync.expire(START + TURN_MS * 3)).toBeNull();
  });

  it('a predicted timeout survives the rival’s last-moment move as a fresh prediction', () => {
    const sync = new DuelSync({ state: createDuel(puzzle.givens, 1), version: 1, turnStartedAt: START }, 0, solution);
    sync.expire(START + TURN_MS);
    const late = serverMove(sync.confirmed.state, 2, 1, empty[0], solution[empty[0]]);
    expect(sync.receive(late).kind).toBe('unexpected');
    expect(sync.shown.state.turn).toBe(1);
    // The turn did not pass with that move, so its deadline is still over.
    expect(sync.expire(START + TURN_MS)?.event).toEqual({ kind: 'timeout', seat: 1 });
  });

  it('compares server JSON regardless of key order', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });
});
