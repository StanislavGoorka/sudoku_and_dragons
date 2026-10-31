import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createBattle, generatePuzzle, resolveMove, STAGES } from '../../core/index.ts';
import { parseSavedBattle, type SavedBattle } from './battleSave.ts';

function checkpoint(): SavedBattle {
  const stage = STAGES[1];
  const puzzle = generatePuzzle(42, stage.region.difficulty);
  const grid = [...puzzle.givens];
  const battle = createBattle(stage.enemy);
  const cell = grid.indexOf(0);
  resolveMove(battle, applyMove(grid, puzzle.solution, cell, puzzle.solution[cell]));
  battle.playerHp = 37;
  battle.charge = 4.75;
  const selected = grid.indexOf(0);
  const notes = new Array(81).fill(0);
  notes[selected] = (1 << 2) | (1 << 7);
  return { version: 1, puzzle, stage: stage.id, grid, battle, notes, selected, notesMode: true, mistakes: 2, bestCombo: 0, elapsed: 91.25 };
}

describe('solo battle checkpoint', () => {
  it('keeps a boss attack cadence across restart, while legacy checkpoints start at the first attack', () => {
    const saved = checkpoint();
    saved.stage = 'peaks-boss'; saved.puzzle = generatePuzzle(42, 'medium'); saved.grid = [...saved.puzzle.givens];
    saved.battle = createBattle(STAGES.find((s) => s.id === 'peaks-boss')!.enemy);
    saved.battle.timedAttacks = 2;
    expect(parseSavedBattle(JSON.parse(JSON.stringify(saved)))?.battle.timedAttacks).toBe(2);
    delete (saved.battle as Partial<typeof saved.battle>).timedAttacks;
    expect(parseSavedBattle(saved)?.battle.timedAttacks).toBe(0);
  });
  it('restores the same board, HP, attack charge, time and manual notes after serialization', () => {
    const saved = checkpoint();
    expect(parseSavedBattle(JSON.parse(JSON.stringify(saved)))).toEqual({ ...saved, daily: undefined });
  });

  it('restores daily battles with their original date, even after midnight', () => {
    const saved = checkpoint();
    delete saved.stage;
    saved.daily = '2026-10-30';
    saved.battle = createBattle(STAGES[0].enemy);
    expect(parseSavedBattle(saved)?.daily).toBe('2026-10-30');
  });

  it.each([
    (s: SavedBattle) => { s.version = 2 as 1; },
    (s: SavedBattle) => { s.grid[s.grid.indexOf(0)] = 10; },
    (s: SavedBattle) => { s.grid[s.puzzle.givens.findIndex((d) => d !== 0)] = 0; },
    (s: SavedBattle) => { s.battle.playerHp = 0; },
    (s: SavedBattle) => { s.battle.charge = Infinity; },
    (s: SavedBattle) => { s.battle.outcome = 'won'; },
    (s: SavedBattle) => { s.elapsed = -1; },
    (s: SavedBattle) => { s.notes = [2]; },
    (s: SavedBattle) => { s.stage = 'removed-stage'; },
  ])('rejects an unusable checkpoint (%#)', (corrupt) => {
    const saved = checkpoint();
    corrupt(saved);
    expect(parseSavedBattle(saved)).toBeNull();
  });

  it('keeps wrong manual candidates and only clears notes in occupied cells', () => {
    const saved = checkpoint();
    saved.notes[saved.puzzle.givens.findIndex((d) => d !== 0)] = 1022;
    const recovered = parseSavedBattle(saved)!;
    expect(recovered.notes[saved.selected!]).toBe(saved.notes[saved.selected!]);
    expect(recovered.notes.filter((bits) => bits !== 0)).toHaveLength(1);
  });
});

describe('checkpoint persistence', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
  });

  it('loads the checkpoint after an app restart and does not trigger cloud uploads for timer ticks', async () => {
    const store = await import('./store.ts');
    const upload = vi.fn();
    store.onProgressSaved(upload);
    store.saveActiveBattle(checkpoint());
    expect(upload).not.toHaveBeenCalled();
    vi.resetModules();
    const restarted = await import('./store.ts');
    expect(restarted.activeBattle()?.elapsed).toBe(91.25);
    expect(restarted.activeBattle()?.battle.playerHp).toBe(37);
  });

  it('finishes a battle and stores its reward in one write, so restarting cannot pay it twice', async () => {
    const store = await import('./store.ts');
    const { recordBattle } = await import('./progress.ts');
    const saved = checkpoint();
    store.saveActiveBattle(saved);
    recordBattle(store.progress, { difficulty: 'easy', won: true, mistakes: 0, hpLeft: 50, maxHp: 50, seconds: 40, bestCombo: 0, stage: saved.stage });
    store.saveActiveBattle(null);
    vi.resetModules();
    const restarted = await import('./store.ts');
    expect(restarted.activeBattle()).toBeNull();
    expect(restarted.progress.levels.easy.wins).toBe(1);
  });

  it('keeps the game playable when storage is full', async () => {
    const store = await import('./store.ts');
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceeded'); } });
    expect(store.saveActiveBattle(checkpoint())).toBe(false);
    expect(store.activeBattle()).not.toBeNull();
  });
});
