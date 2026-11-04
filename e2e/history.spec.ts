import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

for (const [width, height] of [[360, 640], [375, 812]]) {
  test(`battle history restores and replays the same result without rewards on ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await skipTutorial(page);
    await page.route('http://127.0.0.1:54321/**', r => r.abort());
    await page.goto('/'); await ready(page);
    await tapButton(page, 'Walcz!'); await ready(page, 'GameScreen');
    await page.evaluate(() => {
      const s = window.__game.screen;
      s.update((s.battle.enemy.attackEvery + 1) * 1000);
      s.debugMistake(); s.pause();
    });
    await page.reload(); await ready(page);
    await tapButton(page, 'Wznów walkę'); await ready(page, 'GameScreen');
    await tapButton(page, 'Wróć do walki');
    const end = await page.evaluate(() => {
      const s = window.__game.screen; s.debugFill(0);
      return { hp: [s.battle.playerHp, s.battle.enemyHp], result: s.battle.outcome, board: s.grid.join('') };
    });
    const before = await page.evaluate(() => localStorage.getItem('sudoku-dragons.progress'));
    await tapButton(page, 'Analiza walki'); await ready(page, 'ReplayScreen');
    const report = await page.evaluate(() => {
      const s = window.__game.screen;
      return { partial: s.replay.partial, kinds: s.replay.steps.slice(0, 2).map((step: any) => step.event.kind),
        final: s.replay.steps.at(-1).state, summary: s.summary.text,
        bottom: s.restart.y + s.restart.buttonHeight, boardBottom: s.board.y + s.board.height, infoTop: s.info.y };
    });
    expect(report.partial).toBe(false);
    expect(report.kinds).toEqual(['timer', 'wrong']);
    expect(report.final).toEqual(end);
    expect(report.summary).toContain('Twój rekord');
    expect(report.bottom).toBeLessThanOrEqual(height);
    expect(report.boardBottom).toBeLessThan(report.infoTop);
    await tapButton(page, 'Następny');
    expect(await page.evaluate(() => window.__game.screen.info.text)).toContain('Atak na czas');
    await tapButton(page, 'Poprzedni');
    expect(await page.evaluate(() => window.__game.screen.stepIndex)).toBe(0);
    await tapButton(page, 'Tempo 1×'); await tapButton(page, 'Odtwórz');
    await tapButton(page, 'Pauza');
    expect(await page.evaluate(() => window.__game.screen.playing)).toBe(false);
    await tapButton(page, 'Odtwórz');
    await page.evaluate(() => window.__game.screen.update(200000));
    expect(await page.evaluate(() => window.__game.screen.board.board.join(''))).toBe(end.board);
    expect(await page.evaluate(() => localStorage.getItem('sudoku-dragons.progress'))).toBe(before);
    await tapButton(page, 'Wstecz'); await ready(page, 'HistoryScreen');
    expect(await page.evaluate(() => window.__game.screen.rows.length)).toBe(1);
    await page.reload(); await ready(page);
    await page.evaluate(() => window.__game.progress()); await ready(page, 'ProgressScreen');
    await tapButton(page, 'Historia walk'); await ready(page, 'HistoryScreen');
    await tapButton(page, 'Wygrana · Młody smok'); await ready(page, 'ReplayScreen');
    expect(await page.evaluate(() => window.__game.screen.replay.mode)).toBe('campaign');
  });
}
