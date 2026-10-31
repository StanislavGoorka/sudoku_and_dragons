import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

test('boss phases are readable and the heavy attack cadence survives a restart', async ({ page }) => {
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.goto('/?stage=peaks-boss&seed=42'); await ready(page, 'GameScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.bossLabel.text)).toContain('Co trzeci');
  await page.evaluate(() => { const s = window.__game.screen; s.battle.timedAttacks = 2; s.checkpoint(); });
  await page.goto('/'); await ready(page);
  await tapButton(page, 'Wznów walkę');
  await ready(page, 'GameScreen');
  expect(await page.evaluate(() => window.__game.screen.battle.timedAttacks)).toBe(2);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game.screen.bossLabel.text)).toContain('Następny');
});
