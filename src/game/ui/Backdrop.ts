import { Container, FillGradient, Graphics } from 'pixi.js';
import { uiTheme as theme } from '../uiTheme.ts';

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

/** Quiet, opaque UI background. Gradient helpers above remain unchanged for game artwork. */
export class Backdrop extends Container {
  private readonly sky = new Graphics();

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.sky);
  }

  layout(width: number, height: number): void {
    this.sky.clear().rect(0, 0, width, height).fill(theme.background);
  }
}
