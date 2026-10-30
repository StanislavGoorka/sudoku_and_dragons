import {
  BOT_LEVELS,
  botMove,
  createDuel,
  createRng,
  DUEL_RULES,
  forfeit,
  generatePuzzle,
  playDuelMove,
  timeoutTurn,
  type DuelEvent,
  type DuelState,
  type Difficulty,
  type Grid,
  type Rng,
  type Seat,
} from '../../core/index.ts';
import type { DuelBackend } from './duelBackend.ts';
import { OnlineError, type DuelRow, type Profile } from './online.ts';

export const BOT_ID = 'bot';
const BOT_PROFILE: Profile = { nickname: 'Bot treningowy', dragon: null, effect: null };
/** Like the server: a move a little after the deadline still counts. */
const GRACE_MS = 3000;
/** The bot waits this much longer before the first digit of its turn. */
const TURN_START_MS = 900;

interface Game {
  row: DuelRow;
  solution: Grid;
}

/**
 * Training with a bot, judged on the device with the same rules as the server (core), so it needs no
 * connection and DuelScreen plays it like an online duel. The player sits in seat 0, the bot in seat 1;
 * it plays its turn a digit at a time, thinking as long as its level says (BOT_LEVELS, by difficulty).
 * Nothing it plays counts towards stars or records (`ranked` is false).
 */
export class BotDuel implements DuelBackend {
  readonly ranked = false;
  private readonly difficulty: Difficulty;
  private readonly player: string;
  private readonly rng: Rng;
  private readonly games = new Map<string, Game>();
  private readonly watchers = new Map<string, Set<(row: DuelRow) => void>>();
  private readonly timers = new Map<string, number>();
  private count = 0;

  constructor(difficulty: Difficulty, player: string, seed = Math.floor(Math.random() * 2 ** 32)) {
    this.difficulty = difficulty;
    this.player = player;
    this.rng = createRng(seed);
  }

  /** A new duel on a fresh board, the first turn to either side. */
  start(): { duel: DuelRow; seat: Seat } {
    const { givens, solution } = generatePuzzle(Math.floor(this.rng() * 2 ** 32), this.difficulty);
    const id = `bot-${++this.count}`;
    const row: DuelRow = {
      id,
      mode: 'random',
      code: null,
      difficulty: this.difficulty,
      status: 'playing',
      player0: this.player,
      player1: BOT_ID,
      state: createDuel(givens, this.rng() < 0.5 ? 0 : 1),
      last_event: null,
      version: 1,
      turn_started_at: new Date(this.now()).toISOString(),
      rematch_by: null,
      rematch_declined: false,
      next_duel: null,
    };
    this.games.set(id, { row, solution });
    return { duel: structuredClone(row), seat: 0 };
  }

  now(): number {
    return Date.now();
  }

  async move(duelId: string, cell: number, digit: number): Promise<{ duel: DuelRow; event: DuelEvent }> {
    const game = this.game(duelId);
    if (game.row.status !== 'playing') throw new OnlineError('not-playing');
    if (this.now() > this.deadline(game.row) + GRACE_MS) throw new OnlineError('too-late');
    const event = this.play(game, 0, cell, digit);
    return { duel: structuredClone(game.row), event };
  }

  async claimTimeout(duelId: string): Promise<{ duel: DuelRow }> {
    const game = this.game(duelId);
    if (game.row.status !== 'playing') throw new OnlineError('not-playing');
    const deadline = this.deadline(game.row);
    if (this.now() < deadline) throw new OnlineError('not-yet');
    const event = timeoutTurn(game.row.state);
    if (!event) throw new OnlineError('not-playing');
    // As on the server: the next turn starts at the deadline.
    this.save(game, event, new Date(deadline).toISOString());
    return { duel: structuredClone(game.row) };
  }

  leave(duelId: string): void {
    const game = this.games.get(duelId);
    if (!game || game.row.status !== 'playing') return;
    const event = forfeit(game.row.state, 0);
    if (event) this.save(game, event, game.row.turn_started_at, { rematch_declined: true });
  }

  /** The bot always wants a rematch: the new duel starts at once. */
  async rematch(duelId: string): Promise<{ waiting?: true; duel?: DuelRow; seat?: Seat }> {
    const game = this.game(duelId);
    if (game.row.status !== 'finished') throw new OnlineError('not-finished');
    if (game.row.rematch_declined) throw new OnlineError('rival-left');
    const next = this.start();
    game.row = { ...game.row, next_duel: next.duel.id, version: game.row.version + 1 };
    return next;
  }

  async declineRematch(duelId: string): Promise<unknown> {
    const game = this.games.get(duelId);
    if (game) game.row = { ...game.row, rematch_declined: true };
    return { declined: true };
  }

  async fetchDuel(duelId: string): Promise<DuelRow> {
    return structuredClone(this.game(duelId).row);
  }

  watch(duelId: string, onRow: (row: DuelRow) => void): () => void {
    const set = this.watchers.get(duelId) ?? new Set();
    set.add(onRow);
    this.watchers.set(duelId, set);
    // Like the live connection: the current version once it is up, and the bot's turn if it starts.
    queueMicrotask(() => {
      if (!set.has(onRow)) return;
      onRow(structuredClone(this.game(duelId).row));
      this.scheduleBot(duelId);
    });
    return () => {
      set.delete(onRow);
      if (set.size === 0) this.stopBot(duelId);
    };
  }

  async fetchProfile(): Promise<Profile> {
    return BOT_PROFILE;
  }

  knownProfile(playerId: string): Profile | undefined {
    return playerId === BOT_ID ? BOT_PROFILE : undefined;
  }

  private game(duelId: string): Game {
    const game = this.games.get(duelId);
    if (!game) throw new OnlineError('no-such-duel');
    return game;
  }

  private deadline(row: DuelRow): number {
    return Date.parse(row.turn_started_at ?? '') + DUEL_RULES.turnSeconds * 1000;
  }

  /** Plays one digit for `seat` and records it; a refused move throws the rule's error code. */
  private play(game: Game, seat: Seat, cell: number, digit: number): DuelEvent {
    const state: DuelState = structuredClone(game.row.state);
    const turnBefore = state.turn;
    const result = playDuelMove(state, game.solution, seat, cell, digit);
    if (!result.ok) throw new OnlineError(result.error);
    game.row.state = state;
    const turnStartedAt = state.turn !== turnBefore ? new Date(this.now()).toISOString() : game.row.turn_started_at;
    this.save(game, result.event, turnStartedAt);
    return result.event;
  }

  /** A new version of the duel: shown to the watchers, and the bot's turn goes on if it is the bot's. */
  private save(game: Game, event: DuelEvent, turnStartedAt: string | null, extra: Partial<DuelRow> = {}): void {
    game.row = {
      ...game.row,
      ...extra,
      last_event: event,
      status: game.row.state.finished ? 'finished' : 'playing',
      version: game.row.version + 1,
      turn_started_at: turnStartedAt,
    };
    const row = game.row;
    for (const onRow of this.watchers.get(row.id) ?? []) queueMicrotask(() => onRow(structuredClone(row)));
    this.scheduleBot(row.id);
  }

  /** On the bot's turn, its next digit after a moment's thought (a longer one at the start of a turn). */
  private scheduleBot(duelId: string): void {
    const game = this.games.get(duelId);
    if (!game || game.row.status !== 'playing' || game.row.state.turn !== 1) return;
    if (!this.watchers.get(duelId)?.size || this.timers.has(duelId)) return;
    const level = BOT_LEVELS[this.difficulty];
    const [min, max] = level.thinkMs;
    const firstOfTurn = game.row.state.movesLeft === DUEL_RULES.movesPerTurn;
    const delay = min + this.rng() * (max - min) + (firstOfTurn ? TURN_START_MS : 0);
    const timer = window.setTimeout(() => {
      this.timers.delete(duelId);
      const current = this.games.get(duelId);
      if (!current || current.row.status !== 'playing' || current.row.state.turn !== 1) return;
      const { cell, digit } = botMove(current.row.state, current.solution, level, this.rng);
      this.play(current, 1, cell, digit);
    }, delay);
    this.timers.set(duelId, timer);
  }

  private stopBot(duelId: string): void {
    window.clearTimeout(this.timers.get(duelId));
    this.timers.delete(duelId);
  }
}
