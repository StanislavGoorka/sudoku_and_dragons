import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReplayRecorder, replayState } from './replay.ts';

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

function finished(n: number, partial = false) {
  const start = replayState(new Array(81).fill(0), [50, 50], 'ongoing');
  const log = new ReplayRecorder({ id: `battle-${n}`, title: 'Smok', mode: 'solo', difficulty: 'easy' }, start, 0, partial);
  log.record({ kind: 'timer', damage: 50 }, { ...start, hp: [0, 50], result: 'lost' }, 30000);
  return log.finish(30000, null, n + 1);
}

it('retains 30 finished records across reload, deduplicates and clears them with local data', async () => {
  const { addReplay, battleHistory } = await import('./store.ts');
  for (let n = 0; n < 32; n++) addReplay(finished(n));
  const original = battleHistory()[0];
  expect(addReplay(finished(31, true))).toEqual(original);
  expect(battleHistory().map(r => r.id)).toEqual(Array.from({ length: 30 }, (_, i) => `battle-${31 - i}`));
  vi.resetModules();
  const reloaded = await import('./store.ts');
  expect(reloaded.battleHistory()).toHaveLength(30);
  const { clearHistoryData, HISTORY_KEY } = await import('./storageKey.ts');
  clearHistoryData();
  expect(reloaded.battleHistory()).toEqual([]);
  expect(storage.has(HISTORY_KEY)).toBe(false);
});

it('skips corrupt records and remains available in memory when storage fills', async () => {
  const { HISTORY_KEY } = await import('./storageKey.ts');
  storage.set(HISTORY_KEY, JSON.stringify({ version: 1, items: [{ ...finished(0), elapsed: 0 }, finished(1)] }));
  const { addReplay, battleHistory, historyPersisted } = await import('./store.ts');
  expect(battleHistory().map(r => r.id)).toEqual(['battle-1']);
  vi.stubGlobal('localStorage', { setItem: () => { throw Error('quota'); } });
  addReplay(finished(2));
  expect(historyPersisted()).toBe(false);
  expect(battleHistory().map(r => r.id)).toEqual(['battle-2', 'battle-1']);
});
