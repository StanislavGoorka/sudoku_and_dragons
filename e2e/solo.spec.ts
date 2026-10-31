import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton, tapCell } from './game.ts';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  // These scenarios also prove that solo play and recovery work with no backend at all.
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.goto('/');
  await ready(page);
});

test('a restart restores digits, manual notes, HP, timer and attack charge', async ({ page }) => {
  await tapButton(page, 'Walcz!');
  await ready(page, 'GameScreen');
  const { cell, noteCell, digit } = await page.evaluate(() => {
    const s = window.__game.screen;
    const empty = s.grid.flatMap((d: number, i: number) => d === 0 ? [i] : []);
    return { cell: empty[0], noteCell: empty[1], digit: s.puzzle.solution[empty[0]] };
  });
  await tapCell(page, cell);
  await page.keyboard.press(String((digit % 9) + 1));
  await page.keyboard.press(String(digit));
  await tapCell(page, noteCell);
  await page.keyboard.press('n');
  await page.keyboard.press('2');
  await page.keyboard.press('7');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle);
  expect(before.grid[cell]).toBe(digit);
  expect(before.battle.playerHp).toBeLessThan(50);
  expect(before.notes[noteCell]).toBe((1 << 2) | (1 << 7));
  await page.reload();
  await ready(page);
  await tapButton(page, 'Wznów walkę');
  await ready(page, 'GameScreen');
  const restored = await page.evaluate(() => {
    const s = window.__game.screen;
    return { grid: s.grid, battle: s.battle, elapsed: s.elapsed, notes: s.board.saveNotes(), selected: s.board.selected, notesMode: s.notesMode, paused: Boolean(s.modal) };
  });
  expect(restored).toMatchObject({ grid: before.grid, battle: before.battle, elapsed: before.elapsed,
    notes: before.notes, selected: noteCell, notesMode: true, paused: true });
});

test('starting another battle asks before replacing the saved one', async ({ page }) => {
  await tapButton(page, 'Walcz!');
  await ready(page, 'GameScreen');
  await page.keyboard.press('Escape');
  await tapButton(page, 'Wyjdź do menu');
  await ready(page);
  await tapButton(page, 'Zostań w menu');
  await tapButton(page, 'Wyzwanie dnia');
  await ready(page, 'DailyScreen');
  await tapButton(page, 'Graj offline');
  await ready(page);
  expect(await page.evaluate(() => window.__game.screen.modal.title.text)).toBe('Rozpocząć nową walkę?');
  await tapButton(page, 'Zostań w menu');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle.daily)).toBeUndefined();
  await tapButton(page, 'Wyzwanie dnia');
  await ready(page, 'DailyScreen');
  await tapButton(page, 'Graj offline');
  await tapButton(page, 'Rozpocznij nową');
  await ready(page, 'GameScreen');
  expect(await page.evaluate(() => window.__game.screen.options.daily)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('closing during the victory animation keeps the reward and cannot reopen the won battle', async ({ page }) => {
  await tapButton(page, 'Walcz!');
  await ready(page, 'GameScreen');
  await page.evaluate(() => window.__game.screen.debugFill(0));
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.progress')!));
  expect(before.levels.easy.wins).toBe(1);
  expect(before._soloBattle).toBeNull();
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.__game.state.levels.easy.wins)).toBe(1);
  expect(await page.evaluate(() => window.__game.screen.modal)).toBeNull();
});
