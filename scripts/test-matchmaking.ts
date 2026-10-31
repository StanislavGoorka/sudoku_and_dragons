// Database regression tests for the actual migrations, using independent PostgreSQL sessions.
// Standard PGHOST/PGPORT/PGUSER/PGPASSWORD select a local test server. Only a temporary database
// created by this script is dropped; the application's database is never touched.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createDuel, generatePuzzle } from '../src/core/index.ts';

const host = process.env.PGHOST ?? '127.0.0.1';
assert(['127.0.0.1', 'localhost', '::1'].includes(host), 'Tests require a local PostgreSQL server');
const database = `sudoku_matchmaking_${process.pid}_${Date.now()}`;
const config = { host, user: process.env.PGUSER ?? 'postgres', connectionTimeoutMillis: 5000 };
const owner = new pg.Client({ ...config, database: 'postgres' });
const clients: pg.Client[] = [];

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ ...config, database });
  clients.push(client);
  await client.connect();
  await client.query("set statement_timeout = '10s'");
  return client;
}

const players = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const puzzle = generatePuzzle(7, 'hard');
const state = createDuel(puzzle.givens, 0);
const queue = async (client: pg.Client, player: string, difficulty = 'hard', solution: number[] | null = puzzle.solution) => {
  const result = await client.query('select public.queue_random_duel($1, $2, $3, $4, $5) as joined',
    [player, difficulty, state, 7, solution]);
  return result.rows[0].joined;
};

await owner.connect();
let created = false;
const createdRoles: string[] = [];
try {
  await owner.query(`create database ${database}`);
  created = true;
  // Roles are cluster-wide: remove only the ones this run created, after dropping its database.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if ((await owner.query('select 1 from pg_roles where rolname = $1', [role])).rowCount === 0) {
      await owner.query(`create role ${role}`);
      createdRoles.push(role);
    }
  }
  const observer = await connect();
  await observer.query(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create publication supabase_realtime;
    insert into auth.users values ${players.map((id) => `('${id}')`).join(',')};
  `);
  for (const file of (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await observer.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }

  // A creates a room but does not commit. B cannot see the room, so it must wait for A's lock
  // rather than create another room. Observe the blocked database session instead of guessing timing.
  const first = await connect();
  const second = await connect();
  await first.query('begin');
  const a = await queue(first, players[0]);
  assert.equal(a.seat, 0);
  assert.equal(a.duel.status, 'waiting');
  const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
  const secondResult = queue(second, players[1]);
  void secondResult.catch(() => {});
  try {
    let blocked = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const locks = await observer.query("select 1 from pg_locks where pid = $1 and locktype = 'advisory' and not granted", [secondPid]);
      if (locks.rowCount) { blocked = true; break; }
      await delay(20);
    }
    assert(blocked, 'The second request must wait for the first transaction to commit');
    await first.query('commit');
    const b = await secondResult;
    assert.equal(b.duel.id, a.duel.id);
    assert.equal(b.seat, 1);
    assert.equal(b.duel.status, 'playing');
    assert.equal(b.duel.player0, players[0]);
    assert.equal(b.duel.player1, players[1]);
    assert.equal((await observer.query("select count(*) from public.duels where status = 'waiting'")).rows[0].count, '0');
    assert.equal((await observer.query('select count(*) from public.duel_secrets')).rows[0].count, '1');
    console.log('ok   simultaneous empty-queue requests join one complete duel');
  } finally {
    await first.query('rollback');
    await Promise.allSettled([secondResult]);
  }

  const burst = await Promise.all(players.slice(2).map(async (id) => queue(await connect(), id)));
  const byDuel = Map.groupBy(burst, (row) => row.duel.id);
  assert.equal(byDuel.size, 5);
  for (const pair of byDuel.values()) assert.deepEqual(pair.map((row) => row.seat).sort(), [0, 1]);
  assert.equal((await observer.query("select count(*) from public.duels where status = 'waiting'")).rows[0].count, '0');
  console.log('ok   ten concurrent searches pair all players exactly once');

  const easy = await queue(first, players[0], 'easy');
  const medium = await queue(second, players[1], 'medium');
  assert.notEqual(easy.duel.id, medium.duel.id);
  const replacement = await queue(first, players[0], 'easy');
  assert.notEqual(replacement.duel.id, easy.duel.id);
  assert.equal((await observer.query('select status from public.duels where id = $1', [easy.duel.id])).rows[0].status, 'cancelled');
  console.log('ok   difficulties stay separate and a new search replaces the old waiting duel');

  const before = (await observer.query('select count(*) from public.duels')).rows[0].count;
  await assert.rejects(queue(first, players[2], 'hard', null), { code: '23502' });
  assert.equal((await observer.query('select count(*) from public.duels')).rows[0].count, before);
  console.log('ok   a failed secret insert rolls back the whole duel');

  for (const role of ['anon', 'authenticated', 'service_role']) {
    const permissions = await observer.query(`select has_function_privilege($1,
      'public.queue_random_duel(uuid,text,jsonb,bigint,smallint[])', 'execute') as allowed`, [role]);
    assert.equal(permissions.rows[0].allowed, role === 'service_role');
  }
  assert(!('solution' in easy.duel) && !('seed' in easy.duel));
  console.log('ok   only the server can queue players; responses contain no solution');

  // Exercise the diagnostics RPC under actual database roles, with a real JWT subject setting.
  await observer.query(`create or replace function auth.uid() returns uuid language sql as
    'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'`);
  await first.query('set role authenticated');
  await second.query('set role authenticated');
  await assert.rejects(second.query('select public.report_client_diagnostics($1)', [JSON.stringify([])]), { code: '42501' });
  for (const client of [first, second]) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [players[0]]);
  const diagnostic = () => ({ id: randomUUID(), release: 'test-build', platform: 'web', kind: 'runtime', code: 'TypeError',
    screen: 'menu', operation: 'unhandled', location: 'main-HASH.js:1:42', count: 1, value: null });
  const send = (client: pg.Client, events: object[]) => client.query('select public.report_client_diagnostics($1) as accepted', [JSON.stringify(events)]);
  const event = diagnostic();
  assert.equal((await send(first, [event])).rows[0].accepted, true);
  await send(first, [event]);
  assert.equal((await observer.query('select count(*) from private.client_diagnostics')).rows[0].count, '1');
  await assert.rejects(first.query('select * from private.client_diagnostics'), { code: '42501' });
  await assert.rejects(send(first, [{ ...diagnostic(), message: 'must-not-be-stored' }]), { code: '22023' });
  await assert.rejects(send(first, [{ ...diagnostic(), location: 'https://private.test/?token=secret' }]), { code: '23514' });
  console.log('ok   diagnostics require authentication, hide reports, reject personal/free-form fields and deduplicate retries');
  for (let remaining = 58; remaining > 0; remaining -= 8) {
    await send(first, Array.from({ length: Math.min(remaining, 8) }, diagnostic));
  }
  const finalTwo = await Promise.all([send(first, [diagnostic()]), send(second, [diagnostic()])]);
  assert.equal(finalTwo.filter((r) => r.rows[0].accepted).length, 1);
  assert.equal((await observer.query('select count(*) from private.client_diagnostics')).rows[0].count, '60');
  console.log('ok   simultaneous diagnostic requests cannot exceed the daily limit');
  await observer.query("update private.client_diagnostics set received_at = now() - interval '15 days'");
  await first.query("select set_config('request.jwt.claim.sub', $1, false)", [players[1]]);
  await send(first, [diagnostic()]);
  assert.equal((await observer.query('select count(*) from private.client_diagnostics')).rows[0].count, '1');
  console.log('ok   report retention removes expired diagnostics');

  // Only the trusted referee can write ranked results. The public response never reveals account IDs.
  await assert.rejects(first.query("select public.begin_daily_run($1, current_date, 'easy', 7)", [players[1]]), { code: '42501' });
  await assert.rejects(first.query("select public.finish_daily_run($1, $1, 0)", [players[1]]), { code: '42501' });
  const day = (await observer.query("select (now() at time zone 'UTC')::date::text as day")).rows[0].day;
  const run1 = (await observer.query("select public.begin_daily_run($1,$2,'easy',7) as run", [players[0], day])).rows[0].run;
  const run2 = (await observer.query("select public.begin_daily_run($1,$2,'easy',7) as run", [players[1], day])).rows[0].run;
  await assert.rejects(first.query('update public.daily_runs set elapsed_ms = 1'), { code: '42501' });
  assert.equal((await first.query('select count(*) from public.daily_runs where id = $1', [run1.id])).rows[0].count, '0');
  await observer.query("update public.daily_runs set started_at = clock_timestamp() - interval '30 seconds' where id = $1", [run1.id]);
  const finished = (await observer.query('select public.finish_daily_run($1,$2,0) as result', [players[0], run1.id])).rows[0].result;
  assert(finished.elapsed_ms >= 30000);
  assert.deepEqual((await observer.query('select public.finish_daily_run($1,$2,0) as result', [players[0], run1.id])).rows[0].result, finished);
  await observer.query('update public.daily_runs set elapsed_ms = $1 where id = $2', [finished.elapsed_ms, run2.id]);
  const ranking = (await first.query("select public.daily_leaderboard('easy', $1) as ranking", [day])).rows[0].ranking;
  assert.equal(ranking.players, 2); assert.equal(ranking.top.length, 2);
  assert.equal(ranking.own.place, 1); assert(ranking.top.every((r: { place: number }) => r.place === 1));
  assert(!JSON.stringify(ranking).includes('user_id') && !JSON.stringify(ranking).includes(players[0]));
  assert.equal((await first.query("select public.daily_leaderboard('hard', $1) as ranking", [day])).rows[0].ranking.players, 0);
  for (let i = 0; i < 19; i++) await observer.query("select public.begin_daily_run($1,$2,'easy',7)", [players[1], day]);
  await assert.rejects(observer.query("select public.begin_daily_run($1,$2,'easy',7)", [players[1], day]), { code: 'P0001' });
  console.log('ok   daily ranking isolates categories, hides IDs, enforces ownership/quotas and records server time once');
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) await owner.query(`drop database ${database} with (force)`);
  for (const role of createdRoles) await owner.query(`drop role ${role}`);
  await owner.end();
}
