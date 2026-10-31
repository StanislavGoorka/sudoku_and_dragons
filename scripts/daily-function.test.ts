import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { describe, expect, it } from 'vitest';
import { applyMove, createBattle, dailySeed, ENEMIES, generatePuzzle, resolveMove, verifyDaily } from '../src/core/index.ts';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/daily/index.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, ''));
function referee() {
  let handler: (request: Request) => Promise<Response>;
  let run: any, recorded = false;
  const admin = { auth: { getClaims: async (token: string) => ({ data: token ? { claims: { sub: token } } : null }) },
    rpc: async (name: string, args: any) => {
      if (name === 'begin_daily_run') run = { id: '00000000-0000-4000-8000-000000000001', user_id: args.player,
        difficulty: args.level, day: args.day_key, seed: args.board_seed, started_at: new Date(Date.now() - 100000).toISOString() };
      if (name === 'finish_daily_run') recorded = true;
      return { data: name === 'begin_daily_run' ? run : { elapsed_ms: 100001 } };
    },
    from: () => {
      const filters: [string, string][] = [];
      const query: any = { select: () => query, eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: run && filters.every(([k, v]) => run[k] === v) ? run : null }) };
      return query;
    } };
  new Function('createClient', 'Deno', 'dailySeed', 'verifyDaily', source)(() => admin,
    { env: { get: () => '' }, serve: (value: typeof handler) => { handler = value; } }, dailySeed, verifyDaily);
  return { send: async (body: any, user = 'owner') => handler(new Request('http://localhost/daily', {
    method: 'POST', headers: { Authorization: `Bearer ${user}` }, body: JSON.stringify(body),
  })), recorded: () => recorded };
}
describe('daily Edge Function referee', () => {
  it('requires auth and ignores a supplied board, owner and score', async () => {
    const server = referee();
    expect((await server.send({}, '')).status).toBe(401);
    const start = await (await server.send({ action: 'start', difficulty: 'easy', seed: 123, user_id: 'someone-else' })).json();
    const run = start.run;
    expect(run.seed).toBe(dailySeed(new Date().toISOString().slice(0, 10), 'easy'));
    expect(run.user_id).toBe('owner');
    expect((await server.send({ action: 'finish', runId: run.id, moves: [] })).status).toBe(400);
    expect((await server.send({ action: 'finish', runId: run.id, moves: [] }, 'other')).status).toBe(404);
    const puzzle = generatePuzzle(run.seed, 'easy'), grid = [...puzzle.givens], battle = createBattle(ENEMIES.easy), moves = [];
    for (let cell = 0; cell < 81 && battle.outcome === 'ongoing'; cell++) if (!grid[cell]) {
      moves.push({ cell, digit: puzzle.solution[cell], at: 0 });
      resolveMove(battle, applyMove(grid, puzzle.solution, cell, puzzle.solution[cell]));
    }
    const finish = await server.send({ action: 'finish', runId: run.id, moves, elapsed_ms: 1 });
    expect(finish.status).toBe(200);
    expect((await finish.json()).result.elapsed_ms).toBe(100001);
    expect(server.recorded()).toBe(true);
  });
});
