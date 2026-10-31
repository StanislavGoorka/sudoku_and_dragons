import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

const id = '00000000-0000-4000-8000-000000000041';
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const user = { id, email: 'test@example.test', is_anonymous: false, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
  refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
test('in-app account deletion confirms intent, preserves data offline, then clears it after success', async ({ page }) => {
  await skipTutorial(page); await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript((s) => localStorage.setItem('sudoku-dragons.auth', JSON.stringify(s)), session);
  let attempts = 0, fail = true;
  await page.route('http://127.0.0.1:54321/**', (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ json: {}, headers });
    if (route.request().url().endsWith('/delete-account')) {
      attempts++;
      expect(route.request().postDataJSON()).toEqual({ confirm: 'DELETE' });
      return route.fulfill({ json: fail ? { error: 'server-error' } : { deleted: true }, status: fail ? 500 : 200, headers });
    }
    return route.fulfill({ json: route.request().url().includes('/functions/') ? { nickname: 'Test', serverTime: Date.now() } : [], headers });
  });
  await page.goto('/'); await ready(page);
  await page.evaluate(() => { window.__game.state.stars = 40; window.__game.save(); window.__game.account(); });
  await ready(page, 'AccountScreen'); await tapButton(page, 'Usuń konto i dane'); await tapButton(page, 'Anuluj');
  expect(attempts).toBe(0);
  await tapButton(page, 'Usuń konto i dane'); await tapButton(page, 'Usuń bezpowrotnie');
  await expect.poll(() => page.evaluate(() => window.__game.screen.message.text)).toContain('Nie potwierdzono');
  expect(await page.evaluate(() => window.__game.state.stars)).toBe(40);
  fail = false; await tapButton(page, 'Usuń konto i dane'); await tapButton(page, 'Usuń bezpowrotnie');
  await expect.poll(() => page.evaluate(() => window.__game.screen.message.text)).toContain('Konto i dane usunięte');
  expect(await page.evaluate(() => window.__game.state.stars)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('sudoku-dragons.auth'))).toBeNull();
});
test('web deletion requires a fresh login and never touches the local game save', async ({ page }) => {
  let deleted = false;
  await page.addInitScript(() => localStorage.setItem('sudoku-dragons.progress', 'existing-game-save'));
  await page.route('http://127.0.0.1:54321/**', (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ json: {}, headers });
    if (route.request().url().endsWith('/delete-account')) { deleted = true; return route.fulfill({ json: { deleted: true }, headers }); }
    return route.fulfill({ json: route.request().url().includes('/token') ? { ...session, expires_in: 3600, token_type: 'bearer' } : {}, headers });
  });
  await page.goto('/delete-account.html');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Hasło', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Zaloguj i usuń' }).click(); expect(deleted).toBe(false);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Zaloguj i usuń' }).click();
  await expect(page.getByRole('status')).toContainText('Konto i powiązane dane zostały usunięte');
  expect(deleted).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('sudoku-dragons.progress'))).toBe('existing-game-save');
});
