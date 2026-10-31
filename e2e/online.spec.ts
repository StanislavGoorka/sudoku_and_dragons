import { expect, test, type Page } from '@playwright/test';
import { createDuel, forfeit, generatePuzzle, playDuelMove } from '../src/core/index.ts';
import type { DuelRow } from '../src/game/net/online.ts';
import { ready, skipTutorial, tapButton, tapCell } from './game.ts';

const userId = '00000000-0000-4000-8000-000000000001';
const rivalId = '00000000-0000-4000-8000-000000000002';
const duelId = '00000000-0000-4000-8000-000000000003';
const puzzle = generatePuzzle(7, 'easy');

/** Deterministic transport failures around the real game screens and core rules. The separate
 * local-stack integration job tests the actual Edge Function, Auth, PostgreSQL and RLS. */
async function backend(page: Page, waiting = false) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: '', is_anonymous: true,
    app_metadata: { provider: 'anonymous', providers: ['anonymous'] }, user_metadata: {}, created_at: new Date().toISOString() };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const session = { access_token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  let row: DuelRow = { id: duelId, mode: 'room', code: '1234', difficulty: 'easy', status: waiting ? 'waiting' : 'playing',
    player0: userId, player1: waiting ? null : rivalId, state: createDuel(puzzle.givens, 0), last_event: null,
    version: 1, turn_started_at: waiting ? null : new Date().toISOString(), rematch_by: null,
    rematch_declined: false, next_duel: null };
  let offline = false;
  let rivalWinsOnLeave = false;
  let save: unknown[] = [];
  let delayReads = false;
  let releaseRead = () => {};
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });

  await skipTutorial(page);
  await page.addInitScript(({ session, waiting }) => {
    // A reload must use the persisted current session, not replace state written by the app.
    if (!localStorage.getItem('sudoku-dragons.auth')) localStorage.setItem('sudoku-dragons.auth', JSON.stringify(session));
    if (waiting && !localStorage.getItem('sudoku-dragons.duel-resume')) {
      localStorage.setItem('sudoku-dragons.duel-resume', JSON.stringify({ user: session.user.id, id: '00000000-0000-4000-8000-000000000003' }));
    }
  }, { session, waiting });
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    if (offline) return route.abort();
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const respond = (value: unknown, status = 200) => route.fulfill({ status, json: value, headers });
    if (request.method() === 'OPTIONS') return respond({});
    if (url.pathname.startsWith('/auth/v1/')) return respond(url.pathname.endsWith('/user') ? user : session);
    if (url.pathname === '/functions/v1/duel') {
      const body = request.postDataJSON();
      if (body.action === 'profile') return respond({ nickname: body.nickname, serverTime: Date.now() });
      if (body.action === 'leave') {
        if (rivalWinsOnLeave && !row.state.finished) {
          row.last_event = forfeit(row.state, 1);
          row.status = 'finished'; row.version++; row.rematch_declined = true;
        }
        if (!row.state.finished) {
          row.last_event = forfeit(row.state, 0);
          row.status = 'finished'; row.version++;
          return respond({ duel: row, serverTime: Date.now() });
        }
        // The real handler returns no row when it was already over; the client must re-read it.
        return respond({ cancelled: false, serverTime: Date.now() });
      }
      if (body.action === 'move') {
        const turn = row.state.turn;
        const result = playDuelMove(row.state, puzzle.solution, 0, body.cell, body.digit);
        if (!result.ok) return respond({ error: result.error }, 409);
        row.version++;
        row.last_event = result.event;
        row.status = row.state.finished ? 'finished' : 'playing';
        if (turn !== row.state.turn) row.turn_started_at = new Date().toISOString();
        return respond({ duel: row, event: result.event, serverTime: Date.now() });
      }
      return respond({ serverTime: Date.now() });
    }
    if (url.pathname === '/rest/v1/duels') {
      if (delayReads) await readGate;
      const matches = url.searchParams.get('id') === `eq.${row.id}` ||
        (url.searchParams.get('status') === 'eq.playing' && row.status === 'playing');
      return respond(matches ? [row] : []);
    }
    if (url.pathname === '/rest/v1/profiles') return respond([{ id: rivalId, nickname: 'Rywal testowy', dragon: 'azure', effect: 'sparks' }]);
    if (url.pathname === '/rest/v1/saves') {
      if (request.method() !== 'GET') save = [request.postDataJSON()];
      return respond(save);
    }
    return respond({ error: 'unexpected-test-endpoint' }, 404);
  });

  return {
    row: () => structuredClone(row),
    offline: (value: boolean) => { offline = value; },
    rivalWinsOnLeave: () => { rivalWinsOnLeave = true; },
    finishByRivalLeaving: () => {
      row.last_event = forfeit(row.state, 1);
      row.status = 'finished'; row.version++; row.rematch_declined = true;
    },
    join: () => { row.status = 'playing'; row.player1 = rivalId; row.turn_started_at = new Date().toISOString(); row.version++; },
    delay: () => { delayReads = true; },
    release: () => { delayReads = false; releaseRead(); },
  };
}

test('discovers an online duel without a local pointer, then restores confirmed moves after reload', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/');
  await ready(page, 'DuelScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.connection)).toBe('connected');
  const cell = puzzle.givens.indexOf(0);
  await tapCell(page, cell);
  await page.keyboard.press(String(puzzle.solution[cell]));
  await expect.poll(() => page.evaluate(() => window.__game.screen.sync.confirmed.version)).toBe(2);
  await page.reload();
  await ready(page, 'DuelScreen');
  expect(await page.evaluate(() => window.__game.screen.sync.confirmed.state)).toEqual(server.row().state);
});

test('reconnects to a finished server result and records its reward once across restarts', async ({ page, context }) => {
  const server = await backend(page);
  await page.goto('/');
  await ready(page, 'DuelScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.connection)).toBe('connected');
  server.offline(true);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => window.__game.screen.connectionLabel.text)).toContain('Brak połączenia');
  // An offline digit must not become an optimistic move waiting to be replayed later.
  const cell = puzzle.givens.indexOf(0);
  await tapCell(page, cell);
  await page.keyboard.press(String(puzzle.solution[cell]));
  expect(await page.evaluate((cell) => window.__game.screen.board.board[cell], cell)).toBe(0);
  server.finishByRivalLeaving();
  server.offline(false);
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => window.__game.state.duels.won)).toBe(1);
  await page.reload();
  await ready(page, 'DuelScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.endShown)).toBe(true);
  expect(await page.evaluate(() => window.__game.state.duels.won)).toBe(1);
});

test('restores a waiting room and opens the duel when its rival joins', async ({ page }) => {
  const server = await backend(page, true);
  await page.goto('/');
  await ready(page, 'LobbyScreen');
  expect(await page.evaluate(() => window.__game.screen.view.code)).toBe('1234');
  server.join();
  await ready(page, 'DuelScreen');
  expect(await page.evaluate(() => window.__game.screen.duelId)).toBe(duelId);
});

test('a late forfeit records the server win instead of a guessed local defeat', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/');
  await ready(page, 'DuelScreen');
  await expect.poll(() => page.evaluate(() => window.__game.screen.connection)).toBe('connected');
  server.rivalWinsOnLeave();
  await tapButton(page, 'Wyjdź');
  await tapButton(page, 'Poddaj się');
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__game.state.duels)).toEqual({ played: 1, won: 1 });
});

test('a delayed recovery cannot interrupt a solo battle chosen meanwhile', async ({ page }) => {
  const server = await backend(page);
  server.delay();
  const reading = page.waitForRequest((request) => new URL(request.url()).pathname === '/rest/v1/duels');
  await page.goto('/');
  await ready(page);
  await reading;
  await tapButton(page, 'Walcz!');
  await ready(page, 'GameScreen');
  server.release();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku-dragons.duel-resume'))).not.toBeNull();
  expect(await page.evaluate(() => window.__game.screen.constructor.name)).toBe('GameScreen');
});
