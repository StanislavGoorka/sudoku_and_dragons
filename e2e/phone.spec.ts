import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

for (const [width, height] of [[360, 640], [375, 812]]) test(`phone ${width}×${height}: touch keypad, manual notes and settings fit`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.goto('/?seed=123&difficulty=easy'); await ready(page, 'GameScreen');
  const setup = await page.evaluate(() => {
    const s = window.__game.screen, empty = s.grid.flatMap((d: number, i: number) => d === 0 ? [i] : []);
    const noteCell = empty[0], fillCell = empty[1], digit = s.puzzle.solution[fillCell];
    const p = s.board.toGlobal(s.board.cellCenter(noteCell));
    const bounds = s.pad.getBounds();
    return { noteCell, fillCell, digit, x: p.x, y: p.y,
      targets: s.pad.keys.map((k: any) => ({ width: k.root.hitArea.width, height: k.root.hitArea.height })),
      notesTarget: { width: s.notesButton.hitArea.width, height: s.notesButton.hitArea.height },
      boardSize: s.board.cellSize * 9, padBounds: { y: bounds.y, height: bounds.height } };
  });
  for (const target of [...setup.targets, setup.notesTarget]) {
    expect(target.width).toBeGreaterThanOrEqual(48); expect(target.height).toBeGreaterThanOrEqual(48);
  }
  expect(setup.boardSize).toBeGreaterThanOrEqual(width - 36);
  expect(setup.padBounds.y + setup.padBounds.height).toBeLessThanOrEqual(height);
  await page.touchscreen.tap(setup.x, setup.y);
  await tapButton(page, 'Notatki');
  const tapDigit = async (digit: number) => {
    const p = await page.evaluate((d) => {
      const key = window.__game.screen.pad.keys[d - 1].root;
      return key.toGlobal({ x: key.hitArea.width / 2, y: key.hitArea.height / 2 });
    }, digit);
    await page.touchscreen.tap(p.x, p.y);
  };
  await tapDigit(setup.digit);
  expect(await page.evaluate((cell) => window.__game.screen.board.notesAt(cell), setup.noteCell)).toEqual([setup.digit]);
  expect(await page.evaluate((cell) => window.__game.screen.board.cells[cell].notes[0].style.fontSize, setup.noteCell)).toBeGreaterThanOrEqual(11);
  await tapButton(page, 'Notatki');
  const at = await page.evaluate((cell) => { const b = window.__game.screen.board; return b.toGlobal(b.cellCenter(cell)); }, setup.fillCell);
  await page.touchscreen.tap(at.x, at.y); await tapDigit(setup.digit);
  expect(await page.evaluate((cell) => window.__game.screen.grid[cell], setup.fillCell)).toBe(setup.digit);
  expect(await page.evaluate((cell) => window.__game.screen.board.notesAt(cell), setup.noteCell)).toEqual([setup.digit]);
  await page.evaluate(() => { window.__game.menu(); window.__game.screen.closeModal(); });
  await ready(page); await tapButton(page, 'Ustawienia');
  const fits = await page.evaluate(() => window.__game.screen.modal.buttons.every((b: any) => b.title.width <= b.buttonWidth - 24 + 0.1));
  expect(fits).toBe(true);
});

test('a long dialog can be dragged until its last action is reachable on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 }); await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.goto('/?seed=123&difficulty=easy'); await ready(page, 'GameScreen');
  await tapButton(page, 'Pauza');
  await page.evaluate(() => window.__game.screen.modal.setMessage('Wynik walki i zdobyte osiągnięcie.\n'.repeat(18)));
  expect(await page.evaluate(() => window.__game.screen.modal.maxScroll)).toBeGreaterThan(0);
  await page.mouse.move(22, 540); await page.mouse.down(); await page.mouse.move(22, 100, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__game.screen.modal.scroll)).toBeGreaterThan(0);
  // Wheel provides the same scrolling on desktop and reaches the final page after a very long body.
  await page.mouse.wheel(0, 2000);
  await tapButton(page, 'Wyjdź do menu'); await ready(page);
});

test('ranked play keeps the saved battle on cancellation or a failed start', async ({ page }) => {
  await skipTutorial(page);
  let starts = 0;
  await page.route('http://127.0.0.1:54321/**', (route) => {
    if (route.request().url().endsWith('/daily') && route.request().postData()?.includes('start')) starts++;
    return route.abort();
  });
  await page.goto('/?seed=123&difficulty=easy'); await ready(page, 'GameScreen');
  await page.evaluate(() => window.__game.ranking()); await ready(page, 'DailyScreen');
  // The ranking transport is offline; invoke the same action as its play button to check the local confirmation.
  await page.evaluate(() => window.__game.screen.start());
  await tapButton(page, 'Anuluj');
  expect(starts).toBe(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle);
  expect(saved).not.toBeNull();
  await page.evaluate(() => window.__game.screen.start());
  await tapButton(page, 'Rozpocznij nową');
  await expect.poll(() => page.evaluate(() => window.__game.screen.status.text)).toContain('Nie udało się rozpocząć');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle)).toEqual(saved);
});
