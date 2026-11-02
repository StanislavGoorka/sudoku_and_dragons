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

/** Navy cloth-like field, with a soft light and sparse geometric seams behind the interface. */
export class Backdrop extends Container {
  private readonly sky = new Graphics();
  private readonly light = new Graphics();
  private readonly seams = new Graphics();
  private readonly fill = verticalGradient([theme.backdropTop, theme.backdropBottom]);
  private readonly glow = glowGradient(theme.backdropGlow, .2);

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.sky, this.light, this.seams);
  }

  layout(width: number, height: number): void {
    this.sky.clear().rect(0, 0, width, height).fill(this.fill);
    this.light.clear().ellipse(width / 2, height * .18, width * .85, height * .6).fill(this.glow);
    const g = this.seams.clear();
    for (let y = 24; y < height; y += 48) for (let x = 24; x < width; x += 48) {
      g.poly([x, y - 2, x + 2, y, x, y + 2, x - 2, y]).fill({ color: theme.panelLight, alpha: .13 });
    }
    for (const x of [8, width - 8]) g.moveTo(x, 0).lineTo(x, height).stroke({ width: 1, color: theme.gold, alpha: .08 });
  }
}
