import { expect, test } from '@playwright/test';
import { ready, tapButton } from './game.ts';

test('global errors are sent as technical fields and the player can opt out', async ({ page }) => {
  const reports: Record<string, unknown>[] = [];
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const user = { id: '00000000-0000-4000-8000-000000000011', aud: 'authenticated', role: 'authenticated',
    is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { user, access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
    refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  await page.addInitScript((session) => localStorage.setItem('sudoku-dragons.auth', JSON.stringify(session)), session);
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (url.pathname.endsWith('/rpc/report_client_diagnostics')) {
      reports.push(...request.postDataJSON().events);
      return route.fulfill({ json: true, headers });
    }
    if (url.pathname.includes('/functions/')) return route.fulfill({ json: { nickname: 'Test', serverTime: Date.now() }, headers });
    return route.fulfill({ json: [], headers });
  });
  await page.clock.install();
  await page.goto('/'); await ready(page);
  await page.clock.setSystemTime(new Date(Date.now() + 61_000));
  await page.addScriptTag({ content: "throw new TypeError('private@example.test password=secret');" });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku-dragons.diagnostics'))).toContain('TypeError');
  await page.evaluate(() => window.__game.diagnostics.flush());
  await expect.poll(() => reports.some((r) => r.code === 'TypeError')).toBe(true);
  expect(JSON.stringify(reports)).not.toMatch(/private@example|password|secret|access_token|refresh_token/);
  expect(reports.find((r) => r.code === 'TypeError')?.screen).toBe('menu');
  await tapButton(page, 'Ustawienia');
  await tapButton(page, 'Raporty błędów: włączone');
  await expect.poll(() => page.evaluate(() => window.__game.feedback.settings.diagnostics)).toBe(false);
  const before = reports.length;
  await page.evaluate(() => window.__game.diagnostics.report('runtime', 'unhandled', new RangeError('private')));
  await page.clock.setSystemTime(new Date(Date.now() + 125_000));
  await page.evaluate(() => window.__game.diagnostics.flush());
  expect(reports).toHaveLength(before);
  expect(await page.evaluate(() => localStorage.getItem('sudoku-dragons.diagnostics'))).toBeNull();
});
