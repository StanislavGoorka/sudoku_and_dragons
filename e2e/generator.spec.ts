import { expect, test } from '@playwright/test';
import { ready, skipTutorial, tapButton } from './game.ts';

test.beforeEach(async ({ page }) => {
  await skipTutorial(page);
  await page.route('http://127.0.0.1:54321/**', r => r.abort());
});

test('an explicit v1 seed URL and a pre-versioning checkpoint retain the shipped board', async ({ page }) => {
  await page.goto('/?seed=0&difficulty=hard&generator=1'); await ready(page, 'GameScreen');
  const before = await page.evaluate(() => {
    const s = window.__game.screen; s.checkpoint();
    const saved = JSON.parse(localStorage.getItem('sudoku-dragons.progress')!);
    delete saved._soloBattle.puzzle.generatorVersion;
    localStorage.setItem('sudoku-dragons.progress', JSON.stringify(saved));
    return { grid: s.grid, seed: s.puzzle.seed, solution: s.puzzle.solution };
  });
  expect(before.seed).toBe(0);
  await page.goto('/'); await ready(page); await tapButton(page, 'Wznów walkę'); await ready(page, 'GameScreen');
  expect(await page.evaluate(() => ({ grid: window.__game.screen.grid,
    seed: window.__game.screen.puzzle.seed, solution: window.__game.screen.puzzle.solution }))).toEqual(before);
  expect(await page.evaluate(() => window.__game.screen.puzzle.generatorVersion)).toBe(1);
});

test('worker generation leaves navigation responsive and a cancelled board cannot open later', async ({ page }) => {
  let release = () => {}, requested = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/puzzleGeneration.worker.ts*', async route => { requested = true; await gate; await route.continue(); });
  try {
    await page.goto('/'); await ready(page);
    await page.evaluate(() => window.__game.start('hard', 42));
    await expect.poll(() => requested).toBe(true);
    await page.keyboard.press('Escape'); await ready(page);
    await tapButton(page, 'Ustawienia');
    expect(await page.evaluate(() => window.__game.screen.modalOpen)).toBe(true);
    release();
    await tapButton(page, 'Gotowe');
    await ready(page);
    await page.evaluate(() => window.__game.start('hard', 42)); await ready(page, 'GameScreen');
    expect(await page.evaluate(() => window.__game.screen.puzzle)).toMatchObject({ generatorVersion: 2, rating: { difficulty: 'hard' } });
    await page.reload(); await ready(page);
    await tapButton(page, 'Wznów walkę'); await ready(page, 'GameScreen');
    expect(await page.evaluate(() => window.__game.screen.puzzle)).toMatchObject({ generatorVersion: 2, rating: { difficulty: 'hard' } });
  } finally { release(); }
});

test('a worker download error offers retry rather than a frozen screen', async ({ page }) => {
  let fail = true;
  await page.route('**/puzzleGeneration.worker.ts*', r => fail ? r.abort() : r.continue());
  await page.goto('/'); await ready(page);
  await page.evaluate(() => window.__game.start('medium', 42));
  await expect.poll(() => page.evaluate(() => window.__game.screen.parent.children.some((c: any) => c.title?.text === 'Nie udało się otworzyć ekranu'))).toBe(true);
  fail = false; await tapButton(page, 'Spróbuj ponownie'); await ready(page, 'GameScreen');
  expect(await page.evaluate(() => window.__game.screen.puzzle.rating.difficulty)).toBe('medium');
});

test('offline bot training and its rematch use the worker without requiring a connection', async ({ page }) => {
  let failWorker = false;
  await page.route('**/puzzleGeneration.worker.ts*', r => failWorker ? r.abort() : r.continue());
  await page.goto('/'); await ready(page);
  await page.evaluate(() => window.__game.lobby()); await ready(page, 'LobbyScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.view.kind)).toBe('offline');
  await tapButton(page, 'Trening z botem'); await ready(page, 'TrainingScreen');
  await tapButton(page, 'Rozpocznij pojedynek'); await ready(page, 'DuelScreen');
  expect(await page.evaluate(() => window.__game.screen.backend.ranked)).toBe(false);
  const before = await page.evaluate(() => window.__game.screen.duelId);
  // Prepare a genuinely finished game with the duel rules. A forfeit intentionally declines rematches.
  await page.evaluate(async () => {
    const path = '/src/core/duel/duel.ts';
    const { playDuelMove } = await import(/* @vite-ignore */ path);
    const s = window.__game.screen, game = s.backend.games.get(s.duelId), state = structuredClone(game.row.state);
    for (let cell = 0; cell < 81 && !state.finished; cell++) if (!state.board[cell]) {
      playDuelMove(state, game.solution, state.turn, cell, game.solution[cell]);
    }
    game.row.state = state; game.row.status = 'finished'; game.row.version += 2; game.row.last_event = null;
    s.applyRow(await s.backend.fetchDuel(s.duelId));
  });
  failWorker = true; await tapButton(page, 'Rewanż');
  await expect.poll(() => page.evaluate(() => window.__game.screen.modal?.button(0).enabled)).toBe(true);
  expect(await page.evaluate(() => window.__game.screen.modal.button(0).title.text)).toBe('Rewanż');
  failWorker = false; await tapButton(page, 'Rewanż'); await ready(page, 'DuelScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.duelId)).not.toBe(before);
});
