import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import { killTweens } from '../fx/tweens.ts';
import type { StarGoal } from '../progress/progress.ts';
import { uiTheme as theme } from '../uiTheme.ts';

const STAR_EDGE = 0x9f8956;

/** A plump five-pointed star centred on (cx, cy): gold with a darker edge, or an empty dark slot. */
export function drawStar(g: Graphics, cx: number, cy: number, r: number, filled = true): Graphics {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.5;
    points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  if (filled) {
    g.poly(points).fill(0xd2b778).stroke({ width: 1, color: STAR_EDGE, join: 'round' });
  } else {
    g.poly(points).stroke({ width: 1, color: theme.panelLight, join: 'round' });
  }
  return g;
}

/** A pill with a star and the player's star count; tappable when given `onTap`. */
export class StarCounter extends Container {
  private readonly bg = new Graphics();
  private readonly icon = new Graphics();
  private readonly value: Text;
  private pillHeight = 36;

  constructor(stars: number, onTap?: () => void) {
    super();
    this.value = new Text({
      text: String(stars),
      style: { fontFamily: theme.fontFamily, fontWeight: '600', fontSize: 16, fill: theme.text },
    });
    this.value.anchor.set(0, 0.5);
    this.addChild(this.bg, this.icon, this.value);
    if (onTap) {
      this.eventMode = 'static';
      this.cursor = 'pointer';
      this.on('pointertap', () => {
        feedback.tap();
        onTap();
      });
    }
  }

  layout(height: number): void {
    this.pillHeight = height;
    this.value.style.fontSize = Math.round(height * 0.38);
    this.draw();
  }

  setValue(stars: number): void {
    this.value.text = String(stars);
    this.draw();
  }

  get pillWidth(): number {
    return this.pillHeight * 1.1 + this.value.width + this.pillHeight * 0.45;
  }

  private draw(): void {
    const h = this.pillHeight;
    const w = this.pillWidth;
    this.bg.clear().roundRect(0, 0, w, h, 8).fill(theme.panel).stroke({ width: 1, color: theme.panelLight });
    drawStar(this.icon.clear(), h * 0.55, h / 2, h * 0.2);
    this.value.position.set(h * 1.0, h / 2 + 1);
    this.hitArea = new Rectangle(0, Math.min(0, (h - 48) / 2), w, Math.max(48, h));
  }
}

interface Slot {
  root: Container;
  star: Graphics;
  label: Text;
}

/** The three stars of a battle, each over its goal; `play` lights up the ones that were met, one by one. */
export class StarRow extends Container {
  static readonly HEIGHT = 84;
  private readonly slots: Slot[];
  private readonly goals: StarGoal[];

  constructor(goals: StarGoal[]) {
    super();
    this.goals = goals;
    this.slots = goals.map((goal) => {
      const root = new Container();
      const empty = drawStar(new Graphics(), 0, 0, 24, false);
      const star = drawStar(new Graphics(), 0, 0, 24, true);
      star.scale.set(0);
      const label = new Text({
        text: goal.label,
        style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 13, fill: theme.textMuted },
      });
      label.anchor.set(0.5, 0);
      label.y = 32;
      root.addChild(empty, star, label);
      this.addChild(root);
      return { root, star, label };
    });
  }

  layout(width: number): void {
    const spacing = Math.min(100, width / 3);
    this.slots.forEach((slot, i) => slot.root.position.set(width / 2 + (i - 1) * spacing, 28));
  }

  /** Lights the met goals' stars in turn, with a rising chime. */
  async play(): Promise<void> {
    let lit = 0;
    for (const [i, slot] of this.slots.entries()) {
      if (!this.goals[i].met) continue;
      await new Promise<void>((resolve) => {
        gsap.fromTo(
          slot.star.scale,
          { x: 0, y: 0 },
          { x: 1, y: 1, duration: 0.4, delay: lit === 0 ? 0.25 : 0.12, ease: 'back.out(3)', onStart: () => feedback.digit(3 + lit * 2), onComplete: resolve },
        );
      });
      if (this.destroyed) return;
      slot.label.style.fill = theme.text;
      lit++;
    }
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(...this.slots.map((slot) => slot.star.scale));
    super.destroy(options);
  }
}
