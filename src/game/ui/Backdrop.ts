import { Container, FillGradient, Graphics } from 'pixi.js';
import { theme } from '../theme.ts';

/** `color` fading from `alpha` in the middle to nothing at the edge. */
export function glowGradient(color: number, alpha: number): FillGradient {
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const a = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `${hex}${a(alpha)}` },
      { offset: 0.5, color: `${hex}${a(alpha * 0.35)}` },
      { offset: 1, color: `${hex}00` },
    ],
    textureSpace: 'local',
  });
}

/** Top-to-bottom gradient through `colors`, spread evenly. */
export function verticalGradient(colors: number[]): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
    textureSpace: 'local',
  });
}

/** Behind every screen and the safe-area margins: a violet night with a soft glow up top. */
export class Backdrop extends Container {
  private readonly sky = new Graphics();
  private readonly glow = new Graphics();
  private readonly skyFill = verticalGradient([theme.backdropTop, theme.backdropBottom]);
  private readonly glowFill = glowGradient(theme.backdropGlow, 0.35);

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.sky, this.glow);
  }

  layout(width: number, height: number): void {
    this.sky.clear().rect(0, 0, width, height).fill(this.skyFill);
    const r = Math.max(width, height) * 0.6;
    this.glow.clear().ellipse(width / 2, 0, r, r * 0.55).fill(this.glowFill);
  }
}
