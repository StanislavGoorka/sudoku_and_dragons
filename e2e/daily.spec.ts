import { expect, test } from '@playwright/test';
import { dailySeed } from '../src/core/index.ts';
import { ready, skipTutorial, tapButton } from './game.ts';

test('ranked play uses the server board, queues a replay and displays the resulting place', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000021';
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`,
    refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} } };
  await page.addInitScript((value) => localStorage.setItem('sudoku-dragons.auth', JSON.stringify(value)), session);
  await skipTutorial(page);
  let finished = false, replay: unknown[] = [];
  const day = new Date().toISOString().slice(0, 10), seed = dailySeed(day, 'easy');
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ json: {}, headers });
    let json: unknown = [];
    if (url.pathname.endsWith('/daily_leaderboard')) json = { day, difficulty: 'easy', players: finished ? 1 : 0,
      top: finished ? [{ place: 1, nickname: 'Ty', elapsed_ms: 42000, mine: true }] : [], own: finished ? { place: 1, elapsed_ms: 42000 } : null };
    else if (url.pathname.endsWith('/daily')) {
      const body = route.request().postDataJSON();
      if (body.action === 'start') json = { run: { id, user_id: session.user.id, day, seed, difficulty: 'easy', started_at: new Date().toISOString() } };
      else { replay = body.moves; finished = true; json = { result: { elapsed_ms: 42000 } }; }
    } else if (url.pathname.includes('/functions/')) json = { nickname: 'Test', serverTime: Date.now() };
    return route.fulfill({ json, headers });
  });
  await page.goto('/'); await ready(page);
  await tapButton(page, 'Wyzwanie dnia'); await ready(page, 'DailyScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.status.text)).toContain('Nie masz jeszcze');
  await tapButton(page, 'Graj w rankingu'); await ready(page, 'GameScreen');
  expect(await page.evaluate(() => window.__game.screen.puzzle.seed)).toBe(seed);
  await page.evaluate(() => window.__game.screen.debugFill(0));
  await expect.poll(() => finished).toBe(true); expect(replay.length).toBeGreaterThan(30);
  await page.evaluate(() => window.__game.ranking()); await ready(page, 'DailyScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.status.text)).toContain('Twoje miejsce: 1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.daily-pending') ?? '[]'))).toHaveLength(0);
});
