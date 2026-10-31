import assert from 'node:assert/strict';

/** Integration tests deliberately have no production fallback, even when run from a developer laptop. */
export const testUrl = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const url = new URL(testUrl);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Integration tests require a loopback Supabase URL');
assert(url.protocol === 'http:' || url.protocol === 'https:', 'Expected an HTTP Supabase URL');
export const testKey = process.env.SUPABASE_TEST_KEY ?? '';
export const adminKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';
assert(testKey && adminKey, 'Set SUPABASE_TEST_KEY and SUPABASE_TEST_SERVICE_KEY from supabase status (or run npm run test:integration)');

export async function deleteTestUser(id: string): Promise<void> {
  assert(/^[0-9a-f-]{36}$/.test(id), 'Invalid test user ID');
  const response = await fetch(`${testUrl}/auth/v1/admin/users/${id}`, {
    method: 'DELETE', headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ should_soft_delete: false }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Cannot clean test user: HTTP ${response.status}`);
}
