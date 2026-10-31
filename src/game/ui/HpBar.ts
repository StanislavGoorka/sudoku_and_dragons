import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions, type PointData } from 'pixi.js';
import { theme } from '../theme.ts';

const BAR_HEIGHT = 24;

/** White label with a dark edge, readable over any fill or sky. */
function barText(text: string, align: 'left' | 'right'): Text {
  const label = new Text({
    text,
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 14,
      fill: theme.text,
      stroke: { color: theme.hpTrack, width: 3, join: 'round' },
    },
  });
  label.anchor.set(align === 'left' ? 0 : 1, 0.5);
  return label;
}

/**
 * A thick pill with the name on the left and HP on the right, inside the bar. On damage the
 * coloured fill drops at once and a pale trail follows a moment later, so the size of the hit stays readable.
 */
export class HpBar extends Container {
  static readonly HEIGHT = BAR_HEIGHT;

  private readonly track = new Graphics();
  private readonly trail = new Graphics();
  private readonly fill = new Graphics();
  private readonly nameText: Text;
  private readonly valueText: Text;
  private readonly maxHp: number;
  private readonly color: number;
  /** Displayed fill and trail, as fractions of max HP. */
  private readonly shown = { fill: 1, trail: 1 };
  private barWidth = 0;

  constructor(name: string, maxHp: number, color: number) {
    super();
    this.maxHp = maxHp;
    this.color = color;
    this.nameText = barText(name, 'left');
    this.valueText = barText(String(maxHp), 'right');
    this.addChild(this.track, this.trail, this.fill, this.nameText, this.valueText);
  }

  layout(width: number): void {
    this.barWidth = width;
    const middle = BAR_HEIGHT / 2 + 1;
    this.nameText.position.set(12, middle);
    this.valueText.position.set(width - 12, middle);
    this.nameText.scale.set(1);
    this.nameText.scale.set(Math.min(1, Math.max(1, width - 32 - this.valueText.width) / Math.max(1, this.nameText.width)));
    this.track
      .clear()
      .roundRect(0, 0, width, BAR_HEIGHT, BAR_HEIGHT / 2)
      .fill({ color: theme.hpTrack, alpha: 0.85 })
      .stroke({ width: 2, color: theme.hpTrack });
    this.redraw();
  }

  setName(name: string): void {
    this.nameText.text = name;
    if (this.barWidth > 0) this.layout(this.barWidth);
  }

  setHp(hp: number): void {
    const ratio = Math.max(0, hp) / this.maxHp;
    this.valueText.text = String(Math.max(0, hp));
    gsap.killTweensOf(this.shown);
    gsap.to(this.shown, { fill: ratio, duration: 0.25, ease: 'power2.out', onUpdate: () => this.redraw() });
    gsap.to(this.shown, {
      trail: ratio,
      duration: 0.5,
      delay: 0.4,
      ease: 'power1.inOut',
      onUpdate: () => this.redraw(),
    });
  }

  /** Middle of the bar, in this container's coordinates. */
  barCenter(): PointData {
    return { x: this.barWidth / 2, y: BAR_HEIGHT / 2 };
  }

  override destroy(options?: DestroyOptions): void {
    gsap.killTweensOf(this.shown);
    super.destroy(options);
  }

  private redraw(): void {
    if (this.destroyed) return;
    this.drawSegment(this.trail, this.shown.trail, theme.hpTrail, false);
    this.drawSegment(this.fill, this.shown.fill, this.color, true);
  }

  private drawSegment(g: Graphics, ratio: number, color: number, shine: boolean): void {
    g.clear();
    const inset = 3;
    const height = BAR_HEIGHT - inset * 2;
    const width = (this.barWidth - inset * 2) * ratio;
    if (width < 1) return;
    const radius = Math.min(height, width) / 2;
    g.roundRect(inset, inset, width, height, radius).fill(color);
    if (shine && width > 8) {
      g.roundRect(inset + 3, inset + 2, width - 6, height * 0.35, radius / 2).fill({ color: 0xffffff, alpha: 0.3 });
    }
  }
}
