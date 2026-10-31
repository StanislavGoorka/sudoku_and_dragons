import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
    if (!token) return json({ error: 'not-signed-in' }, 401);
    // A remote user lookup also rejects a valid but stale JWT belonging to a deleted account.
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'not-signed-in' }, 401);
    const raw = await req.text();
    if (raw.length > 1024) return json({ error: 'too-large' }, 413);
    const body = JSON.parse(raw);
    if (body?.confirm !== 'DELETE' || Object.keys(body).some((key) => key !== 'confirm')) return json({ error: 'confirmation-required' }, 400);
    // Revoke refresh sessions before hard deletion. Never accept an ID supplied by the caller.
    const revoked = await admin.auth.admin.signOut(token, 'global');
    if (revoked.error) throw revoked.error;
    const deleted = await admin.auth.admin.deleteUser(data.user.id, false);
    if (deleted.error) throw deleted.error;
    // Existing foreign keys cascade profiles, saves, daily runs, duels and their secrets.
    return json({ deleted: true });
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'bad-json' : 'server-error' }, error instanceof SyntaxError ? 400 : 500);
  }
});
