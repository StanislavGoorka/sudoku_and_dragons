// Actual game screens with synthetic local progress, plus a code-native store banner. No real accounts.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const dir = resolve('release/store-assets'), origin = 'http://127.0.0.1:4187';
await mkdir(dir, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], {
  env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_KEY: 'offline-store-preview' },
  stdio: 'ignore', windowsHide: true,
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    if (server.exitCode !== null) throw new Error('Store preview server exited (port in use?)');
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
    await delay(500);
  }
  if (!ready) throw new Error('Store preview server did not start');
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL,
    args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('sudoku-dragons.tutorial-battle', 'seen');
    localStorage.setItem('sudoku-dragons.tutorial-duel', 'seen');
    localStorage.setItem('sudoku-dragons.nickname', 'Smoczy Rycerz');
  });
  const page = await context.newPage();
  await page.goto(origin); await page.waitForFunction(() => (window as any).__game?.screen?.constructor.name === 'MenuScreen');
  const capture = async (name: string) => {
    await delay(600);
    await sharp(await page.screenshot()).removeAlpha().png().toFile(resolve(dir, name));
  };
  await capture('01-menu.png');
  await page.evaluate(() => (window as any).__game.start('easy', 123));
  await page.waitForFunction(() => (window as any).__game.screen.constructor.name === 'GameScreen');
  await page.evaluate(() => {
    const s = (window as any).__game.screen, cell = s.grid.findIndex((d: number) => !d);
    s.board.select(cell); s.toggleNotes(); s.handleDigit(2); s.handleDigit(7);
  });
  await capture('02-battle-notes.png');
  await page.evaluate(() => { const g = (window as any).__game; g.screen.checkpoint(); g.map(); });
  await page.waitForFunction(() => (window as any).__game.screen.constructor.name === 'MapScreen');
  await capture('03-campaign.png');
  // A clean device lets this showcase the selected boss without replacing an existing save.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem('sudoku-dragons.progress'));
  await page.goto(`${origin}/?stage=peaks-boss&seed=123`);
  await page.waitForFunction(() => (window as any).__game?.screen?.constructor.name === 'GameScreen');
  await capture('04-boss.png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
    <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#0d1117"/><stop offset="1" stop-color="#151c25"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#sky)"/>
    <circle cx="840" cy="240" r="280" fill="#b7d9ca" opacity=".07"/>
    <path d="M610 0V500M650 0V500M690 0V500M570 120H1024M570 240H1024M570 360H1024" stroke="#b7d9ca" opacity=".08" stroke-width="2"/>
    <text x="64" y="92" fill="#9ca9b9" font-family="Arial" font-size="20" letter-spacing="3">LOGIKA SPOTYKA POJEDYNKI</text>
    <text x="60" y="184" fill="#eef2f6" font-family="Arial" font-weight="bold" font-size="64">Sudoku &amp;</text>
    <text x="60" y="260" fill="#b7d9ca" font-family="Arial" font-weight="bold" font-size="72">Dragons</text>
    <text x="64" y="328" fill="#eef2f6" font-family="Arial" font-size="32">Każda cyfra to cios</text>
    <text x="64" y="406" fill="#9ca9b9" font-family="Arial" font-size="22">Kampania · Pojedynki · Wyzwanie dnia</text>
    <rect x="716" y="18" width="264" height="464" rx="18" fill="#100d20" stroke="#b7d9ca" stroke-width="3"/>
  </svg>`;
  await writeFile(resolve(dir, 'feature-graphic.svg'), svg);
  const shot = await sharp(await readFile(resolve(dir, '02-battle-notes.png'))).resize(252, 448).png().toBuffer();
  await sharp(Buffer.from(svg)).composite([{ input: shot, left: 722, top: 26 }]).flatten({ background: '#0d1117' }).removeAlpha().png().toFile(resolve(dir, 'feature-graphic.png'));
  await sharp('assets/icon-512.png').ensureAlpha().png().toFile(resolve(dir, 'icon-512.png'));
  console.log('Generated four 1080×1920 game screens, a 1024×500 feature graphic and a 512×512 icon.');
} finally {
  await browser?.close();
  server.kill();
}
