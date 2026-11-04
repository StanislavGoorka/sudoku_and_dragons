import { describe, expect, it } from 'vitest';
import { advanceTime, applyMove, createBattle, createDuel, ENEMIES, forfeit, parseGrid, playDuelMove, resolveMove } from '../../core/index.ts';
import { DuelReplay } from './duelReplay.ts';
import { finalState, MAX_STEPS, parseReplay, ReplayRecorder, replayState, summarizeReplay } from './replay.ts';

const solution = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
const givens = solution.map((d, c) => c === 0 || c === 80 ? 0 : d);
const meta = { id: 'solo-1', title: 'Młody smok', mode: 'campaign', difficulty: 'easy' } as const;

describe('battle replay', () => {
  it('preserves real moves, a timed attack, the final board and HP across a saved checkpoint', () => {
    const grid = [...givens], battle = createBattle(ENEMIES.easy);
    const state = () => replayState(grid, [battle.playerHp, battle.enemyHp], battle.outcome);
    let log = new ReplayRecorder(meta, state());
    const timed = advanceTime(battle, battle.enemy.attackEvery)!;
    log.record({ kind: 'timer', damage: timed.damage }, state(), 41000);
    const wrong = resolveMove(battle, applyMove(grid, solution, 0, 5))!;
    log.record({ kind: 'wrong', actor: 0, cell: 0, digit: 5, damage: wrong.damage }, state(), 43000);
    log = new ReplayRecorder(meta, state(), 45000, true, JSON.parse(JSON.stringify(log.draft)));
    for (const [cell, at] of [[0, 50000], [80, 52000]]) {
      const move = applyMove(grid, solution, cell, solution[cell]);
      if (move.kind !== 'correct') throw Error('invalid fixture');
      const hit = resolveMove(battle, move)!;
      log.record({ kind: 'correct', actor: 0, cell, digit: move.digit, damage: hit.damage, units: move.completed }, state(), at);
    }
    const replay = parseReplay(JSON.parse(JSON.stringify(log.finish(52000, 52000))))!;
    expect(replay.partial).toBe(false);
    expect(replay.steps.map(s => s.event.kind)).toEqual(['timer', 'wrong', 'correct', 'correct']);
    expect(finalState(replay)).toEqual({ board: solution.join(''), hp: [50 - wrong.damage - timed.damage, 0], result: 'won' });
    expect(summarizeReplay(replay)).toEqual({ mistakes: 1, mistakeHp: wrong.damage, timerHp: timed.damage, rivalHp: 0,
      boxHp: battle.enemy.maxHp, boxes: 2, moves: 2 });
    const broken = structuredClone(replay);
    broken.steps[1].state.hp[0]++;
    expect(parseReplay(broken)).toBeNull();
  });

  it('marks an old checkpoint and bounds the timeline without fabricating missing steps', () => {
    const state = replayState(givens, [40, 110], 'ongoing');
    const log = new ReplayRecorder(meta, state, 500, true);
    for (let i = 0; i < MAX_STEPS + 3; i++) log.record({ kind: 'timeout', actor: 0 }, state, 500 + i);
    log.record({ kind: 'timer', damage: 40 }, { ...state, hp: [0, 110], result: 'lost' }, 1000);
    const saved = parseReplay(log.finish(1000))!;
    expect(saved.partial).toBe(true);
    expect(saved.steps).toHaveLength(MAX_STEPS);
    expect(saved.initialAt).toBeGreaterThan(500);
    expect(finalState(saved).result).toBe('lost');
  });
});

describe('confirmed duel replay', () => {
  it('records contiguous versions in player order and skips stale or unobserved moves', () => {
    const state = createDuel(givens, 1);
    const row = { id: 'duel-1', difficulty: 'easy' as const, version: 2, state, last_event: null as ReturnType<typeof forfeit> };
    const log = new DuelReplay(row, 1, true, 1000);
    const move = playDuelMove(state, solution, 1, 0, 4);
    if (!move.ok) throw Error('invalid fixture');
    expect(log.draft.steps).toHaveLength(0); // No predicted board entered the recorder.
    log.observe({ ...row, version: 3, last_event: move.event }, 2000);
    log.observe({ ...row, version: 3, last_event: move.event }, 2100);
    expect(log.draft.steps).toHaveLength(1);
    expect(log.draft.steps[0]).toMatchObject({ event: { kind: 'correct', actor: 0, damage: 8 }, state: { hp: [130, 122] } });
    const leave = forfeit(state, 0);
    log.observe({ ...row, version: 5, last_event: leave }, 3000);
    expect(log.draft.partial).toBe(true);
    expect(log.draft.steps.map(s => s.event.kind)).toEqual(['correct', 'gap']);
    expect(finalState(log.draft)).toMatchObject({ hp: [130, 122], result: 'won' });
    const recovered = new DuelReplay({ ...row, version: 5, last_event: leave }, 1, true, 4000);
    expect(recovered.draft.partial).toBe(true);
    expect(recovered.draft.steps).toEqual([]);
    expect(finalState(recovered.draft)).toEqual(finalState(log.draft));
  });
});
