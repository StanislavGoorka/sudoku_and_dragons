import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createDuel, forfeit } from '../src/core/index.ts';

function waitingRoom() {
  return {
    id: 'room',
    status: 'waiting',
    player0: 'host',
    player1: null as string | null,
    state: createDuel(new Array<number>(81).fill(0), 0),
    version: 0,
    turn_started_at: null as string | null,
    last_event: null as unknown,
    rematch_declined: false,
  };
}

type Room = ReturnType<typeof waitingRoom>;
type BeforeWrite = (room: Room, write: number) => Error | void;

// Run the actual Edge Function's leave handler with its game rules. Only the Deno entrypoint
// and database transport are replaced, so tests can force a join between reading and writing.
const source = readFileSync(new URL('../supabase/functions/duel/index.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, ''));
const loadHandler = new Function('createClient', 'Deno', 'forfeit', `${executable}\nreturn leave;`);

function server(beforeWrite?: BeforeWrite) {
  const room = waitingRoom();
  let writes = 0;
  class Query {
    private fields: Record<string, unknown> | null = null;
    private filters: [string, unknown][] = [];

    select() { return this; }
    eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
    update(fields: Record<string, unknown>) { this.fields = fields; return this; }
    async run() {
      if (this.fields) {
        writes++;
        const error = beforeWrite?.(room, writes);
        if (error) return { data: null, error };
      }
      const matches = this.filters.every(([key, value]) => (room as Record<string, unknown>)[key] === value);
      if (!matches) return { data: null, error: null };
      if (this.fields) Object.assign(room, structuredClone(this.fields));
      return { data: structuredClone(room), error: null };
    }
    maybeSingle() { return this.run(); }
    // Supabase queries are thenable even without select(): the old cancellation used this path.
    then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) {
      return this.run().then(resolve, reject);
    }
  }
  const admin = { from: () => new Query() };
  const leave = loadHandler(() => admin, { env: { get: () => '' }, serve: () => {} }, forfeit);
  return { room, leave, writes: () => writes };
}

function join(room: Room): void {
  room.status = 'playing';
  room.player1 = 'rival';
  room.turn_started_at = new Date().toISOString();
  room.version++;
}

describe('leaving an online duel', () => {
  it('confirms cancellation only after updating the waiting room', async () => {
    const { room, leave } = server();
    expect(await leave('host', room.id)).toEqual({ cancelled: true });
    expect(room.status).toBe('cancelled');
    expect(room.version).toBe(1);
    expect(room.state.finished).toBe(false);
  });

  it('forfeits when the rival joins between the read and cancellation', async () => {
    const { room, leave, writes } = server((current, write) => { if (write === 1) join(current); });
    const result = await leave('host', room.id);
    expect(result.cancelled).not.toBe(true);
    expect(result.event).toEqual({ kind: 'forfeit', seat: 0 });
    expect(result.duel.status).toBe('finished');
    expect(room.state.winner).toBe(1);
    expect(room.rematch_declined).toBe(true);
    expect(writes()).toBe(2);
  });

  it('retries again if a move changes the duel before the forfeit is saved', async () => {
    const { room, leave, writes } = server((current, write) => {
      if (write === 1) join(current);
      if (write === 2) current.version++;
    });
    const result = await leave('host', room.id);
    expect(result.duel.status).toBe('finished');
    expect(room.state.winner).toBe(1);
    expect(writes()).toBe(3);
  });

  it('propagates a database error instead of reporting a cancelled room', async () => {
    const error = new Error('database unavailable');
    const { room, leave } = server(() => error);
    await expect(leave('host', room.id)).rejects.toBe(error);
    expect(room.status).toBe('waiting');
  });

  it('reports a conflict after bounded retries rather than claiming success', async () => {
    const { room, leave, writes } = server((current) => { current.version++; });
    await expect(leave('host', room.id)).rejects.toMatchObject({ status: 409, message: 'conflict' });
    expect(room.status).toBe('waiting');
    expect(writes()).toBe(3);
  });

  it('does not let an outsider cancel the room', async () => {
    const { room, leave, writes } = server();
    await expect(leave('outsider', room.id)).rejects.toMatchObject({ status: 403, message: 'not-your-duel' });
    expect(room.status).toBe('waiting');
    expect(writes()).toBe(0);
  });

  it('does not rewrite a duel that has already ended', async () => {
    const { room, leave, writes } = server();
    join(room);
    await leave('host', room.id);
    expect(await leave('host', room.id)).toEqual({ cancelled: false });
    expect(room.state.winner).toBe(1);
    expect(writes()).toBe(1);
  });
});
