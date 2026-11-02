import { Graphics } from 'pixi.js';
import { uiTheme as theme } from '../uiTheme.ts';

/** Restrained metal frame: dark footing, inset edge and short gold corner accents. */
export function drawPanel(g: Graphics, x: number, y: number, w: number, h: number, accented = false): Graphics {
  g.roundRect(x, y + 3, w, h, 10).fill(theme.panelLip)
    .roundRect(x, y, w, h, 10).fill(theme.panel).stroke({ width: 1, color: accented ? theme.gold : theme.panelLight })
    .roundRect(x + 3, y + 3, w - 6, h - 6, 7).stroke({ width: 1, color: theme.panelLight, alpha: .3 });
  const length = Math.min(24, w * .1);
  for (const side of [0, 1]) {
    const start = side ? x + w - 10 - length : x + 10;
    g.moveTo(start, y).lineTo(start + length, y).stroke({ width: 2, color: theme.gold, alpha: accented ? 1 : .55 });
  }
  return g;
}
