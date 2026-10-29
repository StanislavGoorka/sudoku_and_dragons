import {
  DUEL_RULES,
  playDuelMove,
  timeoutTurn,
  type DuelError,
  type DuelEvent,
  type DuelState,
  type Grid,
  type Seat,
} from '../../core/index.ts';

/** A version of the duel: what the server confirmed, or what the client expects it to become. */
export interface Snapshot {
  state: DuelState;
  version: number;
  /** Server time (ms) when the current turn started; null while nobody has a turn yet. */
  turnStartedAt: number | null;
}

/** A row as the server sends it, reduced to what syncing needs. */
export interface ServerVersion extends Snapshot {
  event: DuelEvent | null;
}

export type Action = { kind: 'move'; cell: number; digit: number } | { kind: 'timeout' };

/** A local action, shown at once and sent to the server, which has the last word. */
export interface Prediction {
  action: Action;
  event: DuelEvent;
  /** The duel once the server has applied the action, as far as the client can tell. */
  after: Snapshot;
  /** On its way to the server; cleared again when a failed request is to be retried. */
  sent: boolean;
  /** Server time (ms) from which it may be sent. */
  sendAt: number;
  retries: number;
}

export type Received =
  /** Not newer than what is already confirmed. */
  | { kind: 'stale' }
  /** Exactly what was predicted: the screen already shows it. */
  | { kind: 'confirmed' }
  /** Something the client did not foresee. Every prediction was dropped; the screen undoes them, then shows the row. */
  | { kind: 'unexpected'; before: Snapshot; dropped: Prediction[]; next: boolean };

/**
 * A timeout claim waits this long past the deadline, so a move the other player sent in the last
 * moment reaches the server first. Nobody loses time by it: the server starts the next turn at the deadline.
 */
export const CLAIM_DELAY_MS = 500;

/**
 * Client-side prediction for an online duel. The client solves the shared board itself (it has a
 * single solution), so it knows what each of its moves does before the server answers, and it knows
 * when a turn runs out. The server still judges everything: a version from the server that does not
 * match the predictions replaces them.
 */
export class DuelSync {
  confirmed: Snapshot;
  readonly predictions: Prediction[] = [];
  private readonly seat: Seat;
  private readonly solution: Grid;

  constructor(confirmed: Snapshot, seat: Seat, solution: Grid) {
    this.confirmed = confirmed;
    this.seat = seat;
    this.solution = solution;
  }

  /** What the screen shows: the confirmed duel with every prediction played on top. */
  get shown(): Snapshot {
    return this.predictions.at(-1)?.after ?? this.confirmed;
  }

  /** Server time (ms) when the shown turn runs out, or null when no turn is running. */
  deadline(): number | null {
    const { state, turnStartedAt } = this.shown;
    if (state.finished || turnStartedAt === null) return null;
    return turnStartedAt + DUEL_RULES.turnSeconds * 1000;
  }

  /** Predicts the player's own move, made at server time `now`. */
  play(cell: number, digit: number, now: number): { ok: true; prediction: Prediction } | { ok: false; error: DuelError } {
    const base = this.shown;
    const state = structuredClone(base.state);
    const result = playDuelMove(state, this.solution, this.seat, cell, digit);
    if (!result.ok) return result;
    const turnStartedAt = state.turn !== base.state.turn ? now : base.turnStartedAt;
    return { ok: true, prediction: this.push({ kind: 'move', cell, digit }, result.event, state, turnStartedAt, now) };
  }

  /**
   * Predicts that the shown turn ran out, once its deadline has passed. One timeout at a time:
   * the next one is predicted from the turn start the server confirms.
   */
  expire(now: number): Prediction | null {
    const deadline = this.deadline();
    if (deadline === null || now < deadline) return null;
    if (this.predictions.some((p) => p.action.kind === 'timeout')) return null;
    const state = structuredClone(this.shown.state);
    const event = timeoutTurn(state);
    if (!event) return null;
    return this.push({ kind: 'timeout' }, event, state, deadline, deadline + CLAIM_DELAY_MS);
  }

  /** The prediction to send now: one at a time, in order, each after the one before is confirmed. */
  nextToSend(): Prediction | null {
    const head = this.predictions[0];
    return head && !head.sent ? head : null;
  }

  isPending(prediction: Prediction): boolean {
    return this.predictions.includes(prediction);
  }

  /** Takes a version from the server (an answer to a request, a live update or a poll). */
  receive(row: ServerVersion): Received {
    if (row.version <= this.confirmed.version) return { kind: 'stale' };
    const before = this.confirmed;
    const index = row.version - before.version - 1;
    const predicted = this.predictions[index];
    this.confirmed = { state: row.state, version: row.version, turnStartedAt: row.turnStartedAt };
    if (predicted && sameValue(predicted.after.state, row.state) && sameValue(predicted.event, row.event)) {
      this.predictions.splice(0, index + 1);
      return { kind: 'confirmed' };
    }
    return { kind: 'unexpected', before, dropped: this.predictions.splice(0), next: index === 0 };
  }

  /** Gives up every prediction (the server refused one); the confirmed duel is shown again. */
  dropAll(): Prediction[] {
    return this.predictions.splice(0);
  }

  private push(action: Action, event: DuelEvent, state: DuelState, turnStartedAt: number | null, sendAt: number): Prediction {
    const prediction: Prediction = {
      action,
      event,
      after: { state, version: this.shown.version + 1, turnStartedAt },
      sent: false,
      sendAt,
      retries: 0,
    };
    this.predictions.push(prediction);
    return prediction;
  }
}

/** Deep equality for JSON data. Key order does not matter: the database stores JSON with its own order. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
