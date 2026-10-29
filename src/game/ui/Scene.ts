import { Container, Graphics } from 'pixi.js';
import { theme } from '../theme.ts';
import { glowGradient, verticalGradient } from './Backdrop.ts';

/** The backdrop of a fight: a sky, a light in it, and two rows of hills. */
export interface SceneLook {
  /** Sky colours from top to horizon. */
  sky: number[];
  glow: number;
  /** Where the light sits, as fractions of the scene. */
  glowAt: [number, number];
  hillsBack: number;
  hillsFront: number;
  /** A moon and a few stars (night). */
  night?: boolean;
}

/** One scene per dragon, coloured so the dragon stands out against it, and one for duels. */
export const SCENES: Record<string, SceneLook> = {
  // Bright morning for the young green dragon.
  'young-dragon': {
    sky: [0x4fb0ff, 0x9fd8ff, 0xffd9b0],
    glow: 0xfff3c4,
    glowAt: [0.78, 0.3],
    hillsBack: 0x8f86ff,
    hillsFront: 0x5f4fd6,
  },
  // A sunset behind the red dragon: violet above, orange on the horizon.
  dragon: {
    sky: [0x3b2a8f, 0x8a3fa8, 0xff8a5c],
    glow: 0xffb36b,
    glowAt: [0.25, 0.75],
    hillsBack: 0x5a2f8a,
    hillsFront: 0x2e1a63,
  },
  // Deep blue night with a moon for the ancient one.
  'ancient-dragon': {
    sky: [0x0b1236, 0x1d3a7a, 0x3d6fb8],
    glow: 0xcfe3ff,
    glowAt: [0.8, 0.22],
    hillsBack: 0x1a2c66,
    hillsFront: 0x0e1a45,
    night: true,
  },
  // Twilight for duels, where a blue and an orange dragon face each other.
  duel: {
    sky: [0x2a1f6e, 0x6a3fa8, 0xd76a9a],
    glow: 0xffd2e6,
    glowAt: [0.5, 0.85],
    hillsBack: 0x46308f,
    hillsFront: 0x261a63,
  },
};

/** Where the front hills start, as a fraction of the scene height: the ground dragons hover over. */
const GROUND = 0.8;

/** Fixed star positions (fractions), so the sky does not change between layouts. */
const STARS: [number, number, number][] = [
  [0.08, 0.12, 1.4], [0.18, 0.3, 1], [0.3, 0.08, 1.2], [0.42, 0.22, 0.9], [0.55, 0.1, 1.3],
  [0.64, 0.34, 1], [0.92, 0.42, 1.1], [0.12, 0.5, 0.9], [0.36, 0.44, 1.1], [0.72, 0.06, 0.9],
];

/** A rounded window onto a scene: sky gradient, a soft light, hills. Draw content on top of it. */
export class Scene extends Container {
  private readonly look: SceneLook;
  private readonly sky = new Graphics();
  private readonly light = new Graphics();
  private readonly hills = new Graphics();
  private readonly frame = new Graphics();
  private readonly clip = new Graphics();
  private readonly skyFill: ReturnType<typeof verticalGradient>;
  private readonly glowFill: ReturnType<typeof glowGradient>;
  private sceneHeight = 0;

  constructor(look: SceneLook) {
    super();
    this.look = look;
    this.skyFill = verticalGradient(look.sky);
    this.glowFill = glowGradient(look.glow, look.night ? 0.5 : 0.7);
    const inside = new Container();
    inside.addChild(this.sky, this.light, this.hills);
    inside.mask = this.clip;
    this.addChild(this.clip, inside, this.frame);
    this.eventMode = 'none';
  }

  layout(width: number, height: number, radius = 20): void {
    this.sceneHeight = height;
    this.clip.clear().roundRect(0, 0, width, height, radius).fill(0xffffff);
    this.sky.clear().rect(0, 0, width, height).fill(this.skyFill);

    const [gx, gy] = this.look.glowAt;
    const glowR = Math.min(width, height) * 0.9;
    const light = this.light.clear().ellipse(gx * width, gy * height, glowR, glowR).fill(this.glowFill);
    if (this.look.night) {
      light.circle(gx * width, gy * height, Math.min(width, height) * 0.07).fill(0xf4f8ff);
      for (const [x, y, r] of STARS) light.circle(x * width, y * height, r * 1.4).fill({ color: 0xffffff, alpha: 0.8 });
    }

    // Two rows of soft hills; the front row is the ground.
    const ground = height * GROUND;
    this.hills
      .clear()
      .moveTo(0, ground - height * 0.08)
      .quadraticCurveTo(width * 0.2, ground - height * 0.2, width * 0.42, ground - height * 0.07)
      .quadraticCurveTo(width * 0.65, ground - height * 0.17, width, ground - height * 0.1)
      .lineTo(width, height)
      .lineTo(0, height)
      .closePath()
      .fill(this.look.hillsBack)
      .moveTo(0, ground + height * 0.02)
      .quadraticCurveTo(width * 0.3, ground - height * 0.05, width * 0.6, ground + height * 0.01)
      .quadraticCurveTo(width * 0.82, ground + height * 0.05, width, ground - height * 0.02)
      .lineTo(width, height)
      .lineTo(0, height)
      .closePath()
      .fill(this.look.hillsFront);

    this.frame.clear().roundRect(0, 0, width, height, radius).stroke({ width: 3, color: theme.panelLip });
  }

  /** The ground line, in scene coordinates. */
  groundY(): number {
    return this.sceneHeight * GROUND;
  }
}
