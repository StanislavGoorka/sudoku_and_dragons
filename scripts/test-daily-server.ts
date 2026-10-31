import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { applyMove, createBattle, ENEMIES, generatePuzzle, resolveMove, type DailyMove } from '../src/core/index.ts';

const url = process.env.SUPABASE_TEST_URL!;
assert(url && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Local Supabase credentials required');
assert(process.env.SUPABASE_TEST_KEY && process.env.SUPABASE_TEST_SERVICE_KEY);
const admin = createClient(url, process.env.SUPABASE_TEST_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
try {
  const client = createClient(url, process.env.SUPABASE_TEST_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInAnonymously(); assert.ifError(auth.error); users.push(auth.data.user!.id);
  const start = await client.functions.invoke('daily', { body: { action: 'start', difficulty: 'easy', seed: 123 } });
  assert.ifError(start.error);
  const run = start.data.run, puzzle = generatePuzzle(Number(run.seed), 'easy'), grid = [...puzzle.givens];
  const battle = createBattle(ENEMIES.easy), moves: DailyMove[] = [];
  for (let cell = 0; cell < 81 && battle.outcome === 'ongoing'; cell++) if (!grid[cell]) {
    const digit = puzzle.solution[cell]; moves.push({ cell, digit, at: 0 });
    resolveMove(battle, applyMove(grid, puzzle.solution, cell, digit));
  }
  assert((await client.functions.invoke('daily', { body: { action: 'finish', runId: run.id, moves: [] } })).error);
  assert((await client.from('daily_runs').update({ elapsed_ms: 1 }).eq('id', run.id)).error);
  const finished = await client.functions.invoke('daily', { body: { action: 'finish', runId: run.id, moves, elapsed_ms: 0 } });
  assert.ifError(finished.error); assert(finished.data.result.elapsed_ms > 0);
  const retry = await client.functions.invoke('daily', { body: { action: 'finish', runId: run.id, moves } });
  assert.ifError(retry.error); assert.equal(retry.data.result.elapsed_ms, finished.data.result.elapsed_ms);
  const ranking = await client.rpc('daily_leaderboard', { level: 'easy' }); assert.ifError(ranking.error);
  assert(ranking.data.own && ranking.data.players >= 1);
  assert(!JSON.stringify(ranking.data).includes(auth.data.user!.id));
  const other = createClient(url, process.env.SUPABASE_TEST_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const second = await other.auth.signInAnonymously(); assert.ifError(second.error); users.push(second.data.user!.id);
  assert.equal((await other.from('daily_runs').select('*').eq('id', run.id)).data?.length, 0);
  assert((await other.functions.invoke('daily', { body: { action: 'finish', runId: run.id, moves } })).error);
  console.log('ok   daily Auth/RLS, invalid replay, server time, idempotency, ranking privacy and ownership');
} finally {
  for (const id of users) { const result = await admin.auth.admin.deleteUser(id); assert.ifError(result.error); }
}
