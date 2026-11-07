import { unitsOf, type Unit } from '../../core/sudoku/grid.ts';
import type { Difficulty } from '../../core/sudoku/generator.ts';
import { isHeroClass, type SkillUse } from '../combat/hero.ts';

export const MAX_STEPS = 192;
export type ReplayMode = 'campaign' | 'daily' | 'practice' | 'solo' | 'bot' | 'online';
export type ReplayResult = 'ongoing' | 'won' | 'lost' | 'draw';
export interface ReplayState {
  /** Compact grid; HP and actor numbers are always relative to the player. */
  board: string;
  hp: [number, number];
  result: ReplayResult;
}
export type ReplayEvent =
  | { kind: 'correct'; actor: 0 | 1; cell: number; digit: number; damage: number; units: Unit[]; finisher?: boolean; healed?: number }
  | ({ kind: 'skill'; actor?: 0 | 1 } & SkillUse)
  | { kind: 'wrong'; actor: 0 | 1; cell: number; digit: number; damage: number }
  | { kind: 'timer'; damage: number }
  | { kind: 'timeout' | 'forfeit'; actor: 0 | 1 }
  | { kind: 'gap' };
export interface ReplayStep { at: number; event: ReplayEvent; state: ReplayState }
export interface ReplayMeta { id: string; mode: ReplayMode; difficulty: Difficulty; title: string }
export interface ReplayDraft extends ReplayMeta {
  version: 1;
  initial: ReplayState;
  initialAt: number;
  partial: boolean;
  steps: ReplayStep[];
}
export interface Replay extends ReplayDraft {
  endedAt: number;
  /** Active battle time in solo; time covered by observation in duels. */
  elapsed: number;
  bestMs: number | null;
}

export function replayId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function replayState(grid: readonly number[], hp: [number, number], result: ReplayResult): ReplayState {
  return { board: grid.join(''), hp, result };
}
export function sameState(a: ReplayState, b: ReplayState): boolean {
  return a.board === b.board && a.hp[0] === b.hp[0] && a.hp[1] === b.hp[1] && a.result === b.result;
}
export const finalState = (draft: ReplayDraft): ReplayState => draft.steps.at(-1)?.state ?? draft.initial;
export const lastAt = (draft: ReplayDraft): number => draft.steps.at(-1)?.at ?? draft.initialAt;

function matches(before: ReplayState, event: ReplayEvent, after: ReplayState): boolean {
  if (before.result !== 'ongoing') return false;
  if (event.kind === 'gap') return true;
  let board = before.board;
  const hp = [...before.hp];
  switch (event.kind) {
    case 'correct': {
      if (board[event.cell] !== '0') return false;
      board = board.slice(0, event.cell) + event.digit + board.slice(event.cell + 1);
      hp[1 - event.actor] -= event.damage;
      hp[event.actor] += event.healed ?? 0;
      break;
    }
    case 'wrong':
      if (board[event.cell] !== '0') return false;
      hp[event.actor] -= event.damage;
      break;
    case 'timer': hp[0] -= event.damage; break;
    case 'skill': hp[event.actor ?? 0] += event.healed; break;
  }
  return board === after.board && hp[0] === after.hp[0] && hp[1] === after.hp[1];
}

export class ReplayRecorder {
  readonly draft: ReplayDraft;
  constructor(meta: ReplayMeta, state: ReplayState, at = 0, partial = false, saved?: unknown) {
    const restored = parseDraft(saved);
    this.draft = restored && restored.mode === meta.mode && restored.difficulty === meta.difficulty &&
      restored.title === meta.title && lastAt(restored) <= at && sameState(finalState(restored), state)
      ? structuredClone(restored)
      : { ...meta, version: 1, initial: state, initialAt: at, partial, steps: [] };
  }

  record(event: ReplayEvent, state: ReplayState, at: number): void {
    if (finalState(this.draft).result !== 'ongoing') return;
    if (!matches(finalState(this.draft), event, state)) event = { kind: 'gap' };
    if (event.kind === 'gap') this.draft.partial = true;
    this.draft.steps.push({ at: Math.max(lastAt(this.draft), Math.round(at)), event, state });
    if (this.draft.steps.length > MAX_STEPS) {
      const first = this.draft.steps.shift()!;
      this.draft.initial = first.state;
      this.draft.initialAt = first.at;
      this.draft.partial = true;
    }
  }

  finish(elapsed: number, bestMs: number | null = null, endedAt = Date.now()): Replay {
    return { ...this.draft, elapsed: Math.max(lastAt(this.draft), Math.round(elapsed)), bestMs, endedAt };
  }
}

const int = (x: unknown, min: number, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max;
const modes: ReplayMode[] = ['campaign', 'daily', 'practice', 'solo', 'bot', 'online'];
const results: ReplayResult[] = ['ongoing', 'won', 'lost', 'draw'];
function validState(value: unknown): value is ReplayState {
  const s = value as ReplayState;
  return !!s && typeof s.board === 'string' && /^[0-9]{81}$/.test(s.board) && Array.isArray(s.hp) &&
    s.hp.length === 2 && s.hp.every(h => int(h, 0, 9999)) && results.includes(s.result);
}
function validEvent(value: unknown): value is ReplayEvent {
  const e = value as ReplayEvent;
  if (!e) return false;
  if (e.kind === 'gap') return true;
  if (e.kind === 'skill') return isHeroClass(e.id) && (e.actor === undefined || int(e.actor, 0, 1)) && int(e.healed, 0, 8) && Number.isFinite(e.delayed) && e.delayed >= 0 && e.delayed <= 10;
  if (e.kind === 'timer') return int(e.damage, 0, 9999);
  if (!('actor' in Object(e)) || !int(e.actor, 0, 1)) return false;
  if (e.kind === 'timeout' || e.kind === 'forfeit') return true;
  if ((e.kind !== 'correct' && e.kind !== 'wrong') || !int(e.cell, 0, 80) || !int(e.digit, 1, 9) || !int(e.damage, 0, 9999)) return false;
  return e.kind === 'wrong' || ((e.healed === undefined || int(e.healed, 0, 1)) && (e.finisher === undefined || typeof e.finisher === 'boolean') && Array.isArray(e.units) && e.units.length <= 3 && e.units.every(u =>
    u && unitsOf(e.cell).some(unit => unit.kind === u.kind && unit.index === u.index)));
}
export function parseDraft(value: unknown): ReplayDraft | null {
  const d = value as ReplayDraft;
  if (!d || d.version !== 1 || typeof d.id !== 'string' || !/^[a-z0-9:-]{1,100}$/i.test(d.id) ||
      !modes.includes(d.mode) || !['easy', 'medium', 'hard'].includes(d.difficulty) || typeof d.title !== 'string' ||
      !d.title.length || d.title.length > 80 || !validState(d.initial) || !int(d.initialAt, 0) ||
      typeof d.partial !== 'boolean' || !Array.isArray(d.steps) || d.steps.length > MAX_STEPS) return null;
  let prev = d.initial, at = d.initialAt;
  for (const step of d.steps) {
    if (!step || !int(step.at, at) || !validState(step.state) || !validEvent(step.event) ||
        (!d.partial && step.event.kind === 'gap') || !matches(prev, step.event, step.state)) return null;
    prev = step.state; at = step.at;
  }
  return d;
}
export function parseReplay(value: unknown): Replay | null {
  const r = value as Replay;
  return parseDraft(r) && finalState(r).result !== 'ongoing' && int(r.endedAt, 0, 8.64e15) &&
    int(r.elapsed, lastAt(r)) && (r.bestMs === null || int(r.bestMs, 0)) ? r : null;
}

export function summarizeReplay(replay: ReplayDraft) {
  let mistakes = 0, mistakeHp = 0, timerHp = 0, rivalHp = 0, boxHp = 0, boxes = 0, moves = 0;
  for (const { event: e } of replay.steps) {
    if (e.kind === 'timer') timerHp += e.damage;
    if (e.kind === 'wrong' && e.actor === 0) { mistakes++; mistakeHp += e.damage; }
    if (e.kind === 'correct' && e.actor === 1) rivalHp += e.damage;
    if (e.kind === 'correct' && e.actor === 0) {
      moves++;
      if (e.units.some(u => u.kind === 'box')) { boxes++; boxHp += e.damage; }
    }
  }
  return { mistakes, mistakeHp, timerHp, rivalHp, boxHp, boxes, moves };
}
