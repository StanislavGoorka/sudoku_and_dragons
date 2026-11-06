import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

test('chooses an RPG class, casts a charged potion, and restores it with the battle', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', r => r.abort());
  await page.goto('/'); await ready(page);
  await tapButton(page, 'Klasa postaci'); await ready(page, 'HeroScreen');
  await tapButton(page, 'Alchemik'); await tapButton(page, 'Wybierz: Alchemik');
  await tapButton(page, 'Wstecz'); await ready(page);
  await tapButton(page, 'Walcz!'); await ready(page, 'GameScreen');
  const before = await page.evaluate(() => {
    const s = window.__game.screen;
    s.debugMistake(); s.debugFill(s.grid.filter((n: number) => n === 0).length - 5);
    return { hp: s.battle.playerHp, grid: [...s.grid], enemy: s.battle.enemyHp, focus: s.hero.focus };
  });
  expect(before.focus).toBe(5);
  await tapButton(page, 'Eliksir · 5/5');
  const after = await page.evaluate(() => {
    const s = window.__game.screen;
    return { hp: s.battle.playerHp, grid: s.grid, enemy: s.battle.enemyHp, hero: s.hero,
      event: s.replay.draft.steps.at(-1).event, partial: s.replay.draft.partial, target: s.skillButton.hitArea.height };
  });
  expect(after).toMatchObject({ hp: Math.min(50, before.hp + 8), grid: before.grid, enemy: before.enemy,
    hero: { id: 'alchemist', focus: 0 }, event: { kind: 'skill', id: 'alchemist' }, partial: false });
  expect(after.target).toBeGreaterThanOrEqual(48);
  await page.reload(); await ready(page); await tapButton(page, 'Wznów walkę'); await ready(page, 'GameScreen');
  expect(await page.evaluate(() => {
    const s = window.__game.screen;
    return { hero: s.hero, hp: s.battle.playerHp, event: s.replay.draft.steps.at(-1).event, partial: s.replay.draft.partial };
  })).toEqual({ hero: after.hero, hp: after.hp, event: after.event, partial: false });
});
