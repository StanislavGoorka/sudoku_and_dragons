import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it, vi } from 'vitest';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8')
  .replace(/^import[^\n]+\r?\n/gm, ''));
function server() {
  let handler!: (r: Request) => Promise<Response>;
  const calls: string[] = [];
  const getUser = vi.fn(async (token: string) => ({ data: { user: token === 'valid-owner' ? { id: 'owner' } : null }, error: null }));
  const signOut = vi.fn(async () => { calls.push('revoke'); return { error: null }; });
  const deleteUser = vi.fn(async () => { calls.push('delete'); return { error: null as unknown }; });
  new Function('createClient', 'Deno', source)(() => ({ auth: { getUser, admin: { signOut, deleteUser } } }),
    { env: { get: () => '' }, serve: (value: typeof handler) => handler = value });
  return { calls, signOut, deleteUser, send: (body: unknown = { confirm: 'DELETE' }, token = 'valid-owner', method = 'POST') => handler(new Request('https://local/delete-account', {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })) };
}
it('deletes only the authenticated owner after explicit confirmation and session revocation', async () => {
  const s = server();
  expect((await s.send({}, '')).status).toBe(401);
  expect((await s.send({}, 'deleted-user-token')).status).toBe(401);
  expect((await s.send({ confirm: 'DELETE', user_id: 'victim' })).status).toBe(400);
  expect((await s.send({ confirm: 'NO' })).status).toBe(400);
  expect(s.deleteUser).not.toHaveBeenCalled();
  const response = await s.send();
  expect(await response.json()).toEqual({ deleted: true });
  expect(s.deleteUser).toHaveBeenCalledWith('owner', false);
  expect(s.signOut).toHaveBeenCalledWith('valid-owner', 'global');
  expect(s.calls).toEqual(['revoke', 'delete']);
});
it('never reports success after a failed hard deletion', async () => {
  const s = server(); s.deleteUser.mockResolvedValue({ error: new Error('private server details') });
  const response = await s.send(); expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'server-error' });
});
