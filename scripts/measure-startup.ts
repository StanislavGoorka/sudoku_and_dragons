import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

// Fresh browser contexts, production files, identical mobile CPU/network emulation on each run.
// This is a repeatable lab comparison, not a battery benchmark or a physical Android measurement.
const root = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'dist');
const checkBudget = process.argv.includes('--check');
assert((await stat(resolve(root, 'index.html'))).isFile(), 'Build first: npm run build');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${new URL(req.url!, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url!, 'http://localhost').pathname}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(path);
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' }).end(gzipSync(body));
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
try {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await context.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
    await page.addInitScript(() => {
      const check = () => {
        if (!document.querySelector('canvas')) { requestAnimationFrame(check); return; }
        // Let Pixi draw the screen on the frame after its canvas was mounted.
        requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('lab-first-frame')));
      };
      requestAnimationFrame(check);
    });
    await page.goto(origin);
    await page.waitForFunction(() => performance.getEntriesByName('lab-first-frame').length, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sudoku-dragons.diagnostics') ?? '[]')
      .some((entry: { event: { code: string } }) => entry.event.code === 'boot-ms'), undefined, { timeout: 30_000 });
    const sample = await page.evaluate(() => {
      const ms = performance.getEntriesByName('lab-first-frame')[0].startTime;
      return { firstFrameMs: Math.round(ms), canvasPixels: document.querySelector('canvas')!.width * document.querySelector('canvas')!.height,
        scripts: performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js') && e.startTime <= ms).map((e) => new URL(e.name).pathname) };
    });
    let jsBytes = 0, jsGzipBytes = 0;
    for (const path of sample.scripts) {
      const body = await readFile(resolve(root, `.${path}`));
      jsBytes += body.byteLength; jsGzipBytes += gzipSync(body).byteLength;
    }
    samples.push({ ...sample, jsBytes, jsGzipBytes });
    await context.close();
  }
  console.log(JSON.stringify({ cpuSlowdown: 4, network: '1.6 Mbps / 150 ms', samples,
    medianFirstFrameMs: samples.map((s) => s.firstFrameMs).sort((a, b) => a - b)[1] }, null, 2));
  if (checkBudget) {
    assert(samples.every((sample) => sample.jsGzipBytes <= 225_000), 'Menu startup JS exceeds the 225 kB gzip budget');
    assert(samples.every((sample) => !sample.scripts.some((path) => /\/(Game|Duel|Shop|Map|Account|Lobby|Progress|Daily)Screen-/.test(path))),
      'Optional screens were loaded before the menu frame');
  }
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
}
