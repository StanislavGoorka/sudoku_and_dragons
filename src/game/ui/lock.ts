import type { Graphics } from 'pixi.js';
import { theme } from '../theme.ts';

/** A gold padlock centred on (cx, cy), `size` tall. */
export function drawLock(g: Graphics, cx: number, cy: number, size: number): Graphics {
  const edge = theme.buttonPrimaryLip;
  g.arc(cx, cy - size * 0.12, size * 0.26, Math.PI, 0).stroke({ width: size * 0.13, color: edge, cap: 'round' });
  g.roundRect(cx - size * 0.38, cy - size * 0.12, size * 0.76, size * 0.6, size * 0.14).fill(theme.gold).stroke({ width: size * 0.06, color: edge });
  g.circle(cx, cy + size * 0.1, size * 0.08).fill(theme.buttonPrimaryText);
  g.roundRect(cx - size * 0.03, cy + size * 0.12, size * 0.06, size * 0.16, size * 0.03).fill(theme.buttonPrimaryText);
  return g;
}
