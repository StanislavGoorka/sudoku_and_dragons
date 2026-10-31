import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { dailySeed, verifyDaily } from './core/daily.ts';
import type { Difficulty } from './core/sudoku/generator.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] ?? '';
    if (!token) return json({ error: 'not-signed-in' }, 401);
    const { data, error: authError } = await admin.auth.getClaims(token);
    const uid = data?.claims.sub;
    if (authError || !uid) return json({ error: 'not-signed-in' }, 401);
    const raw = await req.text();
    if (raw.length > 65000) return json({ error: 'too-large' }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object') return json({ error: 'bad-request' }, 400);
    if (body.action === 'start') {
      if (!['easy', 'medium', 'hard'].includes(body.difficulty)) return json({ error: 'bad-difficulty' }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const { data: run, error } = await admin.rpc('begin_daily_run', {
        player: uid, day_key: day, level: body.difficulty, board_seed: dailySeed(day, body.difficulty),
      });
      if (error) return json({ error: error.code === 'P0001' ? 'daily-limit' : 'server-error' }, error.code === 'P0001' ? 429 : 500);
      return json({ run: { ...run, user_id: uid }, serverTime: Date.now() });
    }
    if (body.action !== 'finish' || !/^[0-9a-f-]{36}$/i.test(body.runId ?? '')) return json({ error: 'bad-request' }, 400);
    const { data: run, error: readError } = await admin.from('daily_runs').select('*').eq('id', body.runId).eq('user_id', uid).maybeSingle();
    if (readError) throw readError;
    if (!run) return json({ error: 'not-found' }, 404);
    const wallMs = Date.now() - Date.parse(run.started_at);
    if (wallMs > 86400000) return json({ error: 'expired' }, 410);
    const verified = verifyDaily(Number(run.seed), run.difficulty as Difficulty, body.moves, wallMs);
    if (!verified) return json({ error: 'invalid-replay' }, 400);
    const { data: result, error } = await admin.rpc('finish_daily_run', { player: uid, run_id: run.id, mistakes: verified.mistakes });
    if (error) throw error;
    return json({ result });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'bad-json' }, 400);
    console.error('daily request failed');
    return json({ error: 'server-error' }, 500);
  }
});
