import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

function checkBackend(url: string, service = 'local-service-key') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/test-backend.ts')"], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, SUPABASE_TEST_URL: url, SUPABASE_TEST_KEY: 'local-anon-key', SUPABASE_TEST_SERVICE_KEY: service },
  });
}

it('refuses a cloud endpoint before an integration test can create any data', () => {
  const result = checkBackend('https://production.example.test');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Integration tests require a loopback Supabase URL');
});

it('requires a cleanup credential for integration tests', () => {
  const result = checkBackend('http://127.0.0.1:54321', '');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('SUPABASE_TEST_SERVICE_KEY');
});

it('accepts credentials for an isolated local stack', () => {
  expect(checkBackend('http://127.0.0.1:54321').status).toBe(0);
});
