import { type Page } from '@playwright/test';

// Pixi renders into a canvas. Use the existing DEV bridge for geometry and assertions; input
// still goes through real pointer/key events, so hit testing and modal blocking are exercised.
declare global { interface Window { __game: any } }

export async function ready(page: Page, screen = 'MenuScreen'): Promise<void> {
  await page.waitForFunction((name) => window.__game?.screen?.constructor.name === name, screen, { timeout: 15_000 });
}

export async function tapButton(page: Page, text: string): Promise<void> {
  const at = await page.evaluate(async (label) => {
    const visit = (node: any): any => {
      if (node.title?.text === label && node.eventMode === 'static') return node;
      for (const child of node.children ?? []) { const found = visit(child); if (found) return found; }
    };
    // Canvas has no DOM actionability checks. Wait for a visible, stable target while dialogs
    // pop in, just as a locator click waits for layout/animation to settle.
    let previous = { x: NaN, y: NaN };
    let stable = 0;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline) {
      const button = visit(window.__game.screen.parent);
      if (button) {
        let visible = true;
        for (let node = button; node; node = node.parent) visible &&= node.visible && node.alpha > 0.99;
        const bounds = button.getBounds();
        const next = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        stable = visible && Math.abs(next.x - previous.x) < 0.25 && Math.abs(next.y - previous.y) < 0.25 ? stable + 1 : 0;
        if (stable >= 3) return next;
        previous = next;
      }
      await new Promise(requestAnimationFrame);
    }
    throw new Error(`Button not visible/stable: ${label}`);
  }, text);
  await page.mouse.click(at.x, at.y);
}

export async function tapCell(page: Page, cell: number): Promise<void> {
  const at = await page.evaluate((cell) => {
    const board = window.__game.screen.board;
    const p = board.toGlobal(board.cellCenter(cell));
    return { x: p.x, y: p.y };
  }, cell);
  await page.mouse.click(at.x, at.y);
}

export async function skipTutorial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('sudoku-dragons.tutorial-battle', 'seen');
    localStorage.setItem('sudoku-dragons.tutorial-duel', 'seen');
  });
}
