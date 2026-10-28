import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { theme } from '../theme.ts';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonOptions {
  text: string;
  /** Optional second, smaller line. */
  subtitle?: string;
  variant?: ButtonVariant;
  onTap: () => void;
}

/**
 * Rounded button positioned by its top-left corner like any container.
 * The visible `face` is pivoted in the middle so the press animation shrinks it in place.
 */
export class Button extends Container {
  private readonly face = new Container();
  private readonly bg = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text | null;
  private readonly variant: ButtonVariant;
  private buttonWidth = 0;
  private buttonHeight = 0;
  private highlighted = false;

  constructor(options: ButtonOptions) {
    super();
    this.variant = options.variant ?? 'secondary';
    const primary = this.variant === 'primary';
    this.title = new Text({
      text: options.text,
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '700',
        fill: primary ? theme.buttonPrimaryText : theme.text,
      },
    });
    this.title.anchor.set(0.5);
    this.subtitle = options.subtitle
      ? new Text({
          text: options.subtitle,
          style: { fontFamily: theme.fontFamily, fill: primary ? theme.buttonPrimaryText : theme.textMuted },
        })
      : null;
    this.subtitle?.anchor.set(0.5);

    this.face.addChild(this.bg, this.title);
    if (this.subtitle) this.face.addChild(this.subtitle);
    this.addChild(this.face);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.press(0.95));
    this.on('pointerup', () => this.press(1));
    this.on('pointerupoutside', () => this.press(1));
    this.on('pointertap', () => options.onTap());
  }

  layout(width: number, height: number): void {
    this.buttonWidth = width;
    this.buttonHeight = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.face.pivot.set(width / 2, height / 2);
    this.face.position.set(width / 2, height / 2);

    if (this.subtitle) {
      this.title.style.fontSize = Math.round(Math.min(22, height * 0.3));
      this.subtitle.style.fontSize = Math.round(Math.min(15, height * 0.21));
      this.title.position.set(width / 2, height * 0.37);
      this.subtitle.position.set(width / 2, height * 0.7);
    } else {
      this.title.style.fontSize = Math.round(Math.min(20, height * 0.38));
      this.title.position.set(width / 2, height / 2);
    }
    this.draw();
  }

  /** A gold outline, e.g. for the option chosen last time. */
  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    this.draw();
  }

  override destroy(options?: DestroyOptions): void {
    gsap.killTweensOf(this.face.scale);
    super.destroy(options);
  }

  private draw(): void {
    const fill = this.variant === 'primary' ? theme.buttonPrimary : theme.buttonSecondary;
    this.bg
      .clear()
      .roundRect(0, 0, this.buttonWidth, this.buttonHeight, 14)
      .fill(fill)
      .stroke(
        this.highlighted ? { width: 3, color: theme.boardFrame } : { width: 1, color: theme.lineThin, alpha: 0.6 },
      );
  }

  private press(scale: number): void {
    gsap.to(this.face.scale, { x: scale, y: scale, duration: scale < 1 ? 0.08 : 0.3, ease: 'back.out(3)' });
  }
}
