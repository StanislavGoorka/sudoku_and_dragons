// Runs only against the already-started, unlinked local Supabase stack. No cloud credentials needed.
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const cli = resolve('node_modules/supabase/dist/supabase.js');
const { stdout } = await exec(process.execPath, [cli, 'status', '-o', 'json'], { timeout: 30_000, windowsHide: true });
const status = JSON.parse(stdout);
const url = status.API_URL;
assert(typeof url === 'string' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Expected a local Supabase API');
assert(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'supabase status did not return local test keys');
const env = { ...process.env, SUPABASE_TEST_URL: url, SUPABASE_TEST_KEY: status.ANON_KEY, SUPABASE_TEST_SERVICE_KEY: status.SERVICE_ROLE_KEY };

async function run(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await exec('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).catch(() => {});
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
}

await run('scripts/bundle-function.ts');
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/bundle-function.ts', 'daily'], { env, stdio: 'inherit', windowsHide: true });
  child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Daily bundle failed')));
});
await mkdir('test-results/integration', { recursive: true });
const log = await open('test-results/integration/functions.log', 'w');
const functions = spawn(process.execPath, [cli, 'functions', 'serve'], {
  env, stdio: ['ignore', log.fd, log.fd], detached: process.platform !== 'win32', windowsHide: true,
});
functions.on('error', () => {});
try {
  // A signed legacy anon key passes the local gateway but has no user sub; only our handler
  // returns this exact error. Thus a healthy gateway alone cannot make the readiness check pass.
  let ready = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (functions.exitCode !== null) throw new Error('Function server exited; see test-results/integration/functions.log');
    try {
      const response = await fetch(`${url}/functions/v1/duel`, {
        method: 'POST', headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}`, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(5000),
      });
      if ((await response.json()).error === 'not-signed-in') { ready = true; break; }
    } catch { /* Local runtime may still be loading its first worker. */ }
    await delay(1000);
  }
  assert(ready, 'Duel function did not become ready; see test-results/integration/functions.log');
  await run('scripts/test-duel-server.ts');
  await run('scripts/test-daily-server.ts');
  await run('scripts/test-account-server.ts');
} finally {
  await stop(functions);
  await log.close();
}
