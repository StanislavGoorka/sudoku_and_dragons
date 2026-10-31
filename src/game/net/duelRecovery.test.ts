import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDuel, generatePuzzle } from '../../core/index.ts';
import type { DuelRow } from './online.ts';
import { forgetDuel, recoverDuel, rememberDuel, type RecoverySource } from './duelRecovery.ts';

vi.mock('./online.ts', () => ({ findDuel: vi.fn(), findActiveDuel: vi.fn() }));

const me = { id: 'player-a', nickname: 'Gracz A' };
const row = (patch: Partial<DuelRow> = {}): DuelRow => ({
  id: 'duel-a', mode: 'room', code: '1234', difficulty: 'easy', status: 'playing',
  player0: me.id, player1: 'player-b', state: createDuel(generatePuzzle(7, 'easy').givens, 0),
  last_event: null, version: 4, turn_started_at: new Date().toISOString(),
  rematch_by: null, rematch_declined: false, next_duel: null, ...patch,
});

describe('online duel recovery', () => {
  let storage: Map<string, string>;
  let source: RecoverySource;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    source = { find: vi.fn().mockResolvedValue(null), active: vi.fn().mockResolvedValue(null) };
  });

  it('finds an active server duel even after local storage was lost', async () => {
    const server = row({ player0: 'player-b', player1: me.id });
    vi.mocked(source.active).mockResolvedValue(server);
    expect(await recoverDuel(me, source)).toEqual({ duel: server, seat: 1 });
    expect(source.find).not.toHaveBeenCalled();
    expect(source.active).toHaveBeenCalledWith(me.id);
  });

  it('reads the latest server version instead of restoring a local board or HP', async () => {
    rememberDuel(row(), me);
    const server = row({ version: 19 });
    server.state.hp[0] = 73;
    vi.mocked(source.find).mockResolvedValue(server);
    expect((await recoverDuel(me, source))?.duel).toEqual(server);
    expect(source.active).not.toHaveBeenCalled();
    expect([...storage.values()][0]).not.toContain('hp');
  });

  it('restores a waiting private room with the original code', async () => {
    const waiting = row({ status: 'waiting', player1: null });
    rememberDuel(waiting, me);
    vi.mocked(source.find).mockResolvedValue(waiting);
    expect((await recoverDuel(me, source))?.duel.code).toBe('1234');
  });

  it('restores the result when the rival finished while this player was away', async () => {
    rememberDuel(row(), me);
    const finished = row({ status: 'finished' });
    finished.state.finished = true;
    finished.state.winner = 1;
    vi.mocked(source.find).mockResolvedValue(finished);
    expect((await recoverDuel(me, source))?.duel.status).toBe('finished');
  });

  it('does not look up another account\'s saved duel', async () => {
    rememberDuel(row(), me);
    expect(await recoverDuel({ id: 'other', nickname: 'Inny' }, source)).toBeNull();
    expect(source.find).not.toHaveBeenCalled();
  });

  it('rejects an outsider row even if a transport returned one', async () => {
    vi.mocked(source.active).mockResolvedValue(row({ player0: 'other', player1: 'another' }));
    expect(await recoverDuel(me, source)).toBeNull();
  });

  it.each(['cancelled', 'missing'] as const)('clears a %s pointer after checking for another active duel', async (status) => {
    rememberDuel(row(), me);
    vi.mocked(source.find).mockResolvedValue(status === 'missing' ? null : row({ status }));
    expect(await recoverDuel(me, source)).toBeNull();
    expect(source.active).toHaveBeenCalledOnce();
    expect(storage.size).toBe(0);
  });

  it('preserves the pointer when the server cannot be reached', async () => {
    rememberDuel(row(), me);
    vi.mocked(source.find).mockRejectedValue(new Error('offline'));
    await expect(recoverDuel(me, source)).rejects.toThrow('offline');
    expect(storage.size).toBe(1);
  });

  it('leaving an old screen cannot remove the next duel\'s pointer', () => {
    rememberDuel(row({ id: 'rematch' }), me);
    forgetDuel('duel-a');
    expect(storage.size).toBe(1);
    forgetDuel('rematch');
    expect(storage.size).toBe(0);
  });

  it('still discovers a duel if local storage is unavailable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    vi.mocked(source.active).mockResolvedValue(row());
    expect((await recoverDuel(me, source))?.seat).toBe(0);
  });
});
