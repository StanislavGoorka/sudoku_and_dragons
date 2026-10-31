// Real Auth/Edge/RLS regression, deliberately restricted to the disposable local Supabase stack.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL!;
assert(url && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Local Supabase credentials required');
assert(process.env.SUPABASE_TEST_KEY && process.env.SUPABASE_TEST_SERVICE_KEY);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_TEST_SERVICE_KEY!, options);
const users = new Set<string>();
try {
  const email = `account-${crypto.randomUUID()}@example.test`, password = `Test-${crypto.randomUUID()}`;
  // Generate a real Auth OTP without external mail delivery. SMTP deliverability is a separate manual gate.
  const signup = await admin.auth.admin.generateLink({ type: 'signup', email, password });
  assert.ifError(signup.error); users.add(signup.data.user.id);
  const client = createClient(url, process.env.SUPABASE_TEST_KEY!, options);
  const verified = await client.auth.verifyOtp({ type: 'signup', email, token: signup.data.properties.email_otp });
  assert.ifError(verified.error); assert(verified.data.user?.email_confirmed_at);
  await client.auth.signOut();
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  const reset = await admin.auth.admin.generateLink({ type: 'recovery', email }); assert.ifError(reset.error);
  assert.ifError((await client.auth.verifyOtp({ type: 'recovery', email, token: reset.data.properties.email_otp })).error);
  const newPassword = `Reset-${crypto.randomUUID()}`;
  assert.ifError((await client.auth.updateUser({ password: newPassword })).error);
  await client.auth.signOut();
  assert((await client.auth.signInWithPassword({ email, password })).error);
  assert.ifError((await client.auth.signInWithPassword({ email, password: newPassword })).error);
  const session = (await client.auth.getSession()).data.session!, id = session.user.id;
  const other = await admin.auth.admin.createUser({ email: `other-${crypto.randomUUID()}@example.test`, password, email_confirm: true });
  assert.ifError(other.error); users.add(other.data.user.id);
  assert.ifError((await client.functions.invoke('duel', { body: { action: 'profile', nickname: 'Account test' } })).error);
  assert.ifError((await client.from('saves').insert({ user_id: id, data: {}, version: 1 })).error);
  const room = await client.functions.invoke('duel', { body: { action: 'create', difficulty: 'easy' } }); assert.ifError(room.error);
  assert.ifError((await client.functions.invoke('daily', { body: { action: 'start', difficulty: 'easy' } })).error);
  assert((await client.functions.invoke('delete-account', { body: { confirm: 'DELETE', user_id: other.data.user.id } })).error);
  const deleted = await client.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  assert.ifError(deleted.error); assert.equal(deleted.data.deleted, true); users.delete(id);
  assert((await admin.auth.admin.getUserById(id)).error);
  assert.ifError((await admin.auth.admin.getUserById(other.data.user.id)).error);
  for (const [table, column] of [['profiles', 'id'], ['saves', 'user_id'], ['daily_runs', 'user_id'], ['duels', 'player0']]) {
    const rows = await admin.from(table).select('*').eq(column, id); assert.ifError(rows.error); assert.equal(rows.data?.length, 0, table);
  }
  assert.equal((await admin.from('duel_secrets').select('*').eq('duel_id', room.data.duel.id)).data?.length, 0);
  const stale = await fetch(`${url}/functions/v1/delete-account`, { method: 'POST',
    headers: { apikey: process.env.SUPABASE_TEST_KEY!, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'DELETE' }), signal: AbortSignal.timeout(10000) });
  assert.equal(stale.status, 401);
  assert((await client.auth.refreshSession({ refresh_token: session.refresh_token })).error);
  console.log('ok   real email OTP, password recovery, owner-only hard deletion, cascades and revoked sessions (no SMTP delivery test)');
} finally {
  for (const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
}
