import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import { theme } from '../theme.ts';

/** Gold for the main action, violet for the rest, blue for online play. */
export type ButtonVariant = 'primary' | 'secondary' | 'accent';

/** Icons drawn as shapes (no emoji, so they look the same on every phone). */
export type ButtonIcon = 'pause' | 'back' | 'gear' | 'palette' | 'user' | 'map';

export interface ButtonOptions {
  text: string;
  /** Shown instead of the text. */
  icon?: ButtonIcon;
  /** Optional second, smaller line. */
  subtitle?: string;
  variant?: ButtonVariant;
  onTap: () => void;
}

const COLORS: Record<ButtonVariant, { face: number; lip: number; text: number; subtitle: number }> = {
  primary: { face: theme.buttonPrimary, lip: theme.buttonPrimaryLip, text: theme.buttonPrimaryText, subtitle: theme.buttonPrimaryText },
  secondary: { face: theme.buttonSecondary, lip: theme.buttonSecondaryLip, text: theme.text, subtitle: theme.textMuted },
  accent: { face: theme.buttonAccent, lip: theme.buttonAccentLip, text: theme.text, subtitle: 0xdff3ff },
};

/**
 * A chunky game button positioned by its top-left corner: a coloured face standing on a darker lip.
 * Pressing pushes the face down onto the lip. A square button (width = height) is drawn round.
 */
export class Button extends Container {
  private readonly lip = new Graphics();
  private readonly face = new Container();
  private readonly faceBg = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text | null;
  private readonly icon: Graphics | null;
  private readonly iconName: ButtonIcon | undefined;
  private readonly colors: (typeof COLORS)[ButtonVariant];
  private buttonWidth = 0;
  private buttonHeight = 0;
  private lipHeight = 0;
  private highlighted = false;
  private enabled = true;

  constructor(options: ButtonOptions) {
    super();
    this.colors = COLORS[options.variant ?? 'secondary'];
    this.title = new Text({
      text: options.text,
      style: { fontFamily: theme.fontFamily, fontWeight: '800', fill: this.colors.text },
    });
    this.title.anchor.set(0.5);
    this.subtitle = options.subtitle
      ? new Text({
          text: options.subtitle,
          style: { fontFamily: theme.fontFamily, fontWeight: '500', fill: this.colors.subtitle },
        })
      : null;
    this.subtitle?.anchor.set(0.5);
    if (this.subtitle) this.subtitle.alpha = 0.85;

    this.iconName = options.icon;
    this.icon = options.icon ? new Graphics() : null;
    this.title.visible = !this.icon;
    this.face.addChild(this.faceBg, this.title);
    if (this.subtitle) this.face.addChild(this.subtitle);
    if (this.icon) this.face.addChild(this.icon);
    this.addChild(this.lip, this.face);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.press(true));
    this.on('pointerup', () => this.press(false));
    this.on('pointerupoutside', () => this.press(false));
    this.on('pointertap', () => {
      if (!this.enabled) return;
      feedback.tap();
      options.onTap();
    });
  }

  layout(width: number, height: number): void {
    this.buttonWidth = width;
    this.buttonHeight = height;
    this.lipHeight = Math.max(3, Math.round(Math.min(6, height * 0.1)));
    this.hitArea = new Rectangle(0, 0, width, height);
    const faceHeight = height - this.lipHeight;

    // Baloo sits a little high in its line box, so text is nudged down.
    if (this.subtitle) {
      this.title.style.fontSize = Math.round(Math.min(24, faceHeight * 0.36));
      this.subtitle.style.fontSize = Math.round(Math.min(15, faceHeight * 0.24));
      this.title.position.set(width / 2, faceHeight * 0.38);
      this.subtitle.position.set(width / 2, faceHeight * 0.72);
    } else {
      this.title.style.fontSize = Math.round(Math.min(30, faceHeight * 0.46));
      this.title.position.set(width / 2, faceHeight / 2 + faceHeight * 0.04);
    }
    this.draw();
  }

  setText(text: string): void {
    this.title.text = text;
  }

  /** A disabled button is dimmed and ignores taps. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.alpha = enabled ? 1 : 0.45;
    this.cursor = enabled ? 'pointer' : 'default';
  }

  /** A white ring, e.g. for the option that is on. */
  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    this.draw();
  }

  override destroy(options?: DestroyOptions): void {
    gsap.killTweensOf(this.face);
    super.destroy(options);
  }

  private draw(): void {
    const w = this.buttonWidth;
    const h = this.buttonHeight - this.lipHeight;
    const round = Math.abs(w - this.buttonHeight) < 1;
    const radius = round ? h / 2 : Math.min(18, h * 0.32);
    this.lip.clear().roundRect(0, this.lipHeight, w, h, radius).fill(this.colors.lip);
    this.faceBg
      .clear()
      .roundRect(0, 0, w, h, radius)
      .fill(this.colors.face)
      // A soft shine across the top half.
      .roundRect(3, 2, w - 6, h * 0.46, Math.max(2, radius - 3))
      .fill({ color: 0xffffff, alpha: 0.16 });
    if (this.highlighted) this.faceBg.roundRect(0, 0, w, h, radius).stroke({ width: 3, color: 0xffffff });
    if (this.icon) this.drawIcon(this.icon, w / 2, h / 2, h * 0.24);
  }

  private drawIcon(g: Graphics, cx: number, cy: number, r: number): void {
    const color = this.colors.text;
    g.clear();
    switch (this.iconName) {
      case 'pause':
        g.roundRect(cx - r * 0.8, cy - r, r * 0.55, r * 2, r * 0.2).fill(color);
        g.roundRect(cx + r * 0.25, cy - r, r * 0.55, r * 2, r * 0.2).fill(color);
        break;
      case 'back':
        g.moveTo(cx + r * 0.35, cy - r * 0.9)
          .lineTo(cx - r * 0.55, cy)
          .lineTo(cx + r * 0.35, cy + r * 0.9)
          .stroke({ width: r * 0.5, color, cap: 'round', join: 'round' });
        break;
      case 'gear': {
        const teeth = 8;
        for (let i = 0; i < teeth; i++) {
          const angle = (i / teeth) * Math.PI * 2;
          g.moveTo(cx + Math.cos(angle) * r * 0.6, cy + Math.sin(angle) * r * 0.6)
            .lineTo(cx + Math.cos(angle) * r * 1.15, cy + Math.sin(angle) * r * 1.15)
            .stroke({ width: r * 0.42, color, cap: 'round' });
        }
        g.circle(cx, cy, r * 0.78).fill(color);
        g.circle(cx, cy, r * 0.32).fill(this.colors.face);
        break;
      }
      case 'palette': {
        // A painter's palette with a thumb hole and four dabs of paint.
        g.ellipse(cx, cy + r * 0.05, r * 1.2, r * 1.02).fill(color);
        g.circle(cx + r * 0.42, cy + r * 0.48, r * 0.27).fill(this.colors.face);
        const dabs: [number, number, number][] = [
          [-0.58, 0.12, 0x4fd16b],
          [-0.42, -0.45, 0xffc53d],
          [0.12, -0.6, 0xff6fae],
          [0.62, -0.18, 0x2fb2ff],
        ];
        for (const [dx, dy, paint] of dabs) g.circle(cx + dx * r, cy + dy * r, r * 0.24).fill(paint);
        break;
      }
      case 'map': {
        // A map folded in three, with a dotted path to a marker.
        const top = cy - r * 0.9;
        const bottom = cy + r * 0.9;
        g.poly([cx - r * 1.1, top + r * 0.15, cx - r * 0.37, top, cx + r * 0.37, top + r * 0.15, cx + r * 1.1, top,
          cx + r * 1.1, bottom - r * 0.15, cx + r * 0.37, bottom, cx - r * 0.37, bottom - r * 0.15, cx - r * 1.1, bottom]).fill(color);
        g.moveTo(cx - r * 0.37, top).lineTo(cx - r * 0.37, bottom - r * 0.15).moveTo(cx + r * 0.37, top + r * 0.15).lineTo(cx + r * 0.37, bottom)
          .stroke({ width: r * 0.12, color: this.colors.face, alpha: 0.6 });
        for (const [dx, dy] of [[-0.75, 0.45], [-0.4, 0.15], [0, 0.25], [0.35, 0.0]]) g.circle(cx + dx * r, cy + dy * r, r * 0.09).fill(this.colors.face);
        g.circle(cx + r * 0.7, cy - r * 0.35, r * 0.22).fill(theme.error);
        break;
      }
      case 'user':
        // A head over rounded shoulders.
        g.circle(cx, cy - r * 0.42, r * 0.5).fill(color);
        g.moveTo(cx - r * 1.05, cy + r * 1.05)
          .bezierCurveTo(cx - r * 1.05, cy + r * 0.05, cx + r * 1.05, cy + r * 0.05, cx + r * 1.05, cy + r * 1.05)
          .closePath()
          .fill(color);
        break;
    }
  }

  private press(down: boolean): void {
    if (!this.enabled) return;
    gsap.to(this.face, { y: down ? this.lipHeight * 0.7 : 0, duration: down ? 0.05 : 0.15, ease: 'power2.out' });
  }
}
