import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton, tapCell } from './game.ts';

test('the human warrior swings, takes a hit and falls on the short solo arena', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', r => r.abort());
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await ready(page);
  await tapButton(page, 'Walcz!'); await ready(page, 'GameScreen');
  const setup = await page.evaluate(() => {
    const s = window.__game.screen;
    const cell = s.grid.indexOf(0);
    return { cell, digit: s.puzzle.solution[cell], player: s.arena.playerWarrior.constructor.name,
      enemy: s.arena.dragon.constructor.name };
  });
  expect(setup).toMatchObject({ player: 'WarriorView', enemy: 'DragonView' });
  await tapCell(page, setup.cell);
  await page.keyboard.press(String(setup.digit));
  const slash = await page.evaluate(() => {
    const s = window.__game.screen, warrior = s.arena.playerWarrior;
    warrior.action.pause().time(.235);
    return { arm: warrior.sword.rotation, forward: warrior.rig.x, hp: s.battle.enemyHp, max: s.battle.enemy.maxHp };
  });
  expect(slash.arm).toBeGreaterThan(.5);
  expect(slash.forward).toBeGreaterThan(0);
  expect(slash.hp).toBeLessThan(slash.max);
  await page.evaluate(() => {
    const s = window.__game.screen;
    s.battle.playerHp = 1;
    s.debugMistake();
  });
  await expect.poll(() => page.evaluate(() => window.__game.screen.arena.playerWarrior.dead)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__game.screen.modal?.title.text)).toContain('cię pokonał');
  expect(await page.evaluate(() => window.__game.screen.arena.playerWarrior.rig.rotation)).toBeLessThan(-1);
  await tapButton(page, 'Menu'); await ready(page);
  expect(errors).toEqual([]);
});
