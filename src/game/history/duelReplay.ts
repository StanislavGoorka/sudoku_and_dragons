import type { DuelEvent, DuelState, Seat } from '../../core/duel/duel.ts';
import type { Difficulty } from '../../core/sudoku/generator.ts';
import { lastAt, parseDraft, replayId, ReplayRecorder, replayState, type ReplayEvent } from './replay.ts';

interface ConfirmedDuel {
  id: string;
  difficulty: Difficulty;
  version: number;
  state: DuelState;
  last_event: DuelEvent | null;
}

export class DuelReplay {
  readonly recorder: ReplayRecorder;
  private version: number;
  private readonly start: number;
  private readonly offset: number;

  constructor(row: ConfirmedDuel, private readonly seat: Seat, online: boolean, now: number, resumed?: { replay?: unknown; replayElapsed?: number }) {
    const saved = parseDraft(resumed?.replay);
    this.version = row.version;
    this.start = now;
    this.offset = saved ? Math.max(lastAt(saved), resumed?.replayElapsed ?? 0) : 0;
    this.recorder = new ReplayRecorder({ id: online ? `duel:${row.id}` : replayId(), mode: online ? 'online' : 'bot',
      difficulty: row.difficulty, title: online ? 'Pojedynek online' : 'Pojedynek z botem' }, this.state(row.state),
      this.offset, Boolean(resumed || row.last_event || row.state.finished), saved);
  }

  get draft() { return this.recorder.draft; }
  elapsed(now: number): number { return this.offset + Math.max(0, now - this.start); }

  /** Only authoritative rows enter this API. Versions skipped by polling are not replayed. */
  observe(row: ConfirmedDuel, now: number): void {
    if (row.version <= this.version) return;
    const event = row.version === this.version + 1 && row.last_event ? this.event(row.last_event) : { kind: 'gap' as const };
    this.version = row.version;
    this.recorder.record(event, this.state(row.state), this.elapsed(now));
  }

  private state(s: DuelState) {
    return replayState(s.board, [s.hp[this.seat], s.hp[1 - this.seat]], !s.finished ? 'ongoing' :
      s.winner === null ? 'draw' : s.winner === this.seat ? 'won' : 'lost');
  }

  private event(e: DuelEvent): ReplayEvent {
    const actor = e.seat === this.seat ? 0 : 1;
    if (e.kind === 'correct') return { kind: e.kind, actor, cell: e.cell, digit: e.digit, damage: e.damage, units: e.completed, healed: e.healed };
    if (e.kind === 'skill') return { kind: 'skill', actor, id: e.id, healed: e.healed, delayed: 0 };
    if (e.kind === 'wrong') return { kind: e.kind, actor, cell: e.cell, digit: e.digit, damage: e.damage };
    return { kind: e.kind, actor };
  }
}
