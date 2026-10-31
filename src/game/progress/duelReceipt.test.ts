import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

it('restoring a finished duel after a restart does not count or pay it again', async () => {
  const first = await import('./store.ts');
  expect(first.recordDuelOnce('user', 'duel-a', true)).not.toBeNull();
  const before = JSON.stringify(first.progress);
  vi.resetModules();
  const restarted = await import('./store.ts');
  expect(restarted.recordDuelOnce('user', 'duel-a', true)).toBeNull();
  expect(JSON.stringify(restarted.progress)).toBe(before);
  expect(restarted.recordDuelOnce('user', 'rematch', true)).not.toBeNull();
});

it('a locally recorded forfeit cannot be recorded again when its server result returns', async () => {
  const store = await import('./store.ts');
  store.recordDuelOnce('user', 'duel-a', false);
  expect(store.recordDuelOnce('user', 'duel-a', false)).toBeNull();
  expect(store.recordDuelOnce('other-user', 'duel-a', true)).not.toBeNull();
});
