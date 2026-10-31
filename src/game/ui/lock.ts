import type { Graphics } from 'pixi.js';
import { uiTheme as theme } from '../uiTheme.ts';

/** A gold padlock centred on (cx, cy), `size` tall. */
export function drawLock(g: Graphics, cx: number, cy: number, size: number): Graphics {
  const edge = theme.textMuted;
  g.arc(cx, cy - size * 0.12, size * 0.24, Math.PI, 0).stroke({ width: 1.5, color: edge, cap: 'round' });
  g.roundRect(cx - size * 0.34, cy - size * 0.12, size * 0.68, size * 0.54, 3).fill(theme.panel).stroke({ width: 1.5, color: edge });
  g.circle(cx, cy + size * 0.1, size * 0.045).fill(edge);
  return g;
}
