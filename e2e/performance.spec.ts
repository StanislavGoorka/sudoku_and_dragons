import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

test.use({ viewport: { width: 375, height: 812 } });
test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
});

test('a failed startup download has a visible retry instead of an empty page', async ({ page }) => {
  let fail = true;
  await page.route('**/game/main.ts', (route) => fail ? route.abort() : route.continue());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Nie udało się uruchomić gry');
  fail = false;
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await ready(page);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('optional screens load on demand and a cancelled import cannot replace the current screen', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((done) => { release = done; });
  let requested = false;
  await page.route('**/screens/ShopScreen.ts', async (route) => { requested = true; await gate; await route.continue(); });
  await page.goto('/'); await ready(page);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  expect(resources.join(' ')).not.toMatch(/\/(Game|Duel|Shop|Map|Account|Lobby|Progress|Daily)Screen\.ts/);
  await page.evaluate(() => window.__game.shop());
  await expect.poll(() => requested).toBe(true);
  await page.keyboard.press('Escape');
  await ready(page);
  await page.evaluate(() => window.__game.map());
  await ready(page, 'MapScreen');
  release();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('ShopScreen.ts')))).toBe(true);
  expect(await page.evaluate(() => window.__game.screen.constructor.name)).toBe('MapScreen');
  expect(await page.evaluate(() => window.__game.rendering.loading)).toBe(false);
});

test('a failed screen download offers retry and works on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  let fail = true;
  await page.route('**/screens/AccountScreen.ts', (route) => fail ? route.abort() : route.continue());
  await page.goto('/'); await ready(page);
  await page.evaluate(() => window.__game.account());
  await expect.poll(() => page.evaluate(() => window.__game.screen.parent.children.some((c: any) => c.title?.text === 'Nie udało się otworzyć ekranu'))).toBe(true);
  fail = false;
  await tapButton(page, 'Spróbuj ponownie');
  await ready(page, 'AccountScreen');
  await page.keyboard.press('Escape');
  await ready(page);
  await tapButton(page, 'Ustawienia');
  await tapButton(page, 'Raporty błędów: włączone');
  expect(await page.evaluate(() => window.__game.feedback.settings.diagnostics)).toBe(false);
});

test('a background progress refresh cannot destroy a menu button during a press', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const point = await page.evaluate(() => {
    const s = window.__game.screen; (window as any).__pressedMenu = s;
    const b = s.dailyButton; return b.toGlobal({ x: b.buttonWidth / 2, y: b.buttonHeight / 2 });
  });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.evaluate(async () => {
    const path = '/src/game/progress/store.ts';
    const { replaceProgress } = await import(/* @vite-ignore */ path);
    replaceProgress(window.__game.state);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect(await page.evaluate(() => window.__game.screen === (window as any).__pressedMenu)).toBe(true);
  await page.mouse.up(); await ready(page, 'DailyScreen');
});

test('foreground rendering is capped and backgrounding stops frames, music scheduling and the solo timer', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const expectedResolution = await page.evaluate(() => Math.min(window.devicePixelRatio, 2));
  expect(await page.evaluate(() => window.__game.rendering)).toMatchObject({ active: true, started: true, maxFPS: 30, resolution: expectedResolution });
  await tapButton(page, 'Walcz!'); await ready(page, 'GameScreen');
  expect(await page.evaluate(() => window.__game.rendering.maxFPS)).toBe(60);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__game.rendering)).toMatchObject({ active: false, started: false });
  expect(await page.evaluate(() => window.__game.feedback.musicTimer)).toBeUndefined();
  const before = await page.evaluate(() => window.__game.screen.elapsed);
  // Simulate an extended background interval without relying on browser throttling heuristics.
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.__game.screen.elapsed)).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__game.rendering)).toMatchObject({ active: true, started: true });
  expect(await page.evaluate(() => window.__game.feedback.musicTimer)).toBeDefined();
  await tapButton(page, 'Wróć do walki');
  await expect.poll(() => page.evaluate(() => window.__game.screen.elapsed)).toBeGreaterThan(before);
});
