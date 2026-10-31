import { defineConfig, devices } from '@playwright/test';

const backend = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(backend).hostname)) {
  throw new Error('Browser tests require a local Supabase backend');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Pixel 7'],
    // Keep the phone layout while avoiding a 7x pixel workload on a software-only CI renderer.
    deviceScaleFactor: process.env.CI ? 1 : devices['Pixel 7'].deviceScaleFactor,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    // Exercise WebGL in headless CI without depending on a GPU on the hosted runner.
    launchOptions: { args: process.env.CI ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] : [] },
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: backend, VITE_SUPABASE_KEY: process.env.SUPABASE_TEST_KEY ?? 'offline-test-key' },
    timeout: 60_000,
  },
});
