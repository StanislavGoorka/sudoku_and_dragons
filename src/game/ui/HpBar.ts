import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions, type PointData } from 'pixi.js';
import { theme } from '../theme.ts';

const TEXT_HEIGHT = 18;
const BAR_HEIGHT = 10;

/**
 * Name, HP numbers and a bar. On damage the coloured fill drops at once and a
 * pale trail follows a moment later, so the size of the hit stays readable.
 */
export class HpBar extends Container {
  static readonly HEIGHT = TEXT_HEIGHT + BAR_HEIGHT;

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
    this.nameText = new Text({
      text: name,
      style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 13, fill: theme.text },
    });
    this.valueText = new Text({
      text: `${maxHp}/${maxHp}`,
      style: { fontFamily: theme.fontFamily, fontWeight: '600', fontSize: 13, fill: theme.textMuted },
    });
    this.valueText.anchor.set(1, 0);
    this.addChild(this.nameText, this.valueText, this.track, this.trail, this.fill);
  }

  layout(width: number): void {
    this.barWidth = width;
    this.valueText.position.set(width, 0);
    this.track.clear().roundRect(0, TEXT_HEIGHT, width, BAR_HEIGHT, BAR_HEIGHT / 2).fill(theme.hpTrack);
    this.redraw();
  }

  setName(name: string): void {
    this.nameText.text = name;
  }

  setHp(hp: number): void {
    const ratio = Math.max(0, hp) / this.maxHp;
    this.valueText.text = `${hp}/${this.maxHp}`;
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
    return { x: this.barWidth / 2, y: TEXT_HEIGHT + BAR_HEIGHT / 2 };
  }

  override destroy(options?: DestroyOptions): void {
    gsap.killTweensOf(this.shown);
    super.destroy(options);
  }

  private redraw(): void {
    if (this.destroyed) return;
    this.drawSegment(this.trail, this.shown.trail, theme.hpTrail);
    this.drawSegment(this.fill, this.shown.fill, this.color);
  }

  private drawSegment(g: Graphics, ratio: number, color: number): void {
    g.clear();
    const width = this.barWidth * ratio;
    if (width < 1) return;
    g.roundRect(0, TEXT_HEIGHT, width, BAR_HEIGHT, Math.min(BAR_HEIGHT, width) / 2).fill(color);
  }
}
