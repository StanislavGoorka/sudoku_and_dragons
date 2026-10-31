import { expect, type Page } from '@playwright/test';

// Pixi renders into a canvas. Use the existing DEV bridge for geometry and assertions; input
// still goes through real pointer/key events, so hit testing and modal blocking are exercised.
declare global { interface Window { __game: any } }

export async function ready(page: Page, screen = 'MenuScreen'): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__game?.screen?.constructor.name)).toBe(screen);
}

export async function tapButton(page: Page, text: string): Promise<void> {
  const at = await page.evaluate((label) => {
    const visit = (node: any): any => {
      if (node.title?.text === label && node.eventMode === 'static') return node;
      for (const child of node.children ?? []) { const found = visit(child); if (found) return found; }
    };
    const button = visit(window.__game.screen);
    if (!button) throw new Error(`Button not found: ${label}`);
    const bounds = button.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
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
