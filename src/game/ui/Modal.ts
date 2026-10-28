import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { killTweens } from '../fx/tweens.ts';
import { OVERSCAN } from '../safeArea.ts';
import { theme } from '../theme.ts';
import { Button, type ButtonVariant } from './Button.ts';

export interface ModalAction {
  text: string;
  variant?: ButtonVariant;
  onTap: () => void;
}

const PADDING = 24;
const BUTTON_HEIGHT = 52;
const BUTTON_GAP = 10;

/** A dimmed full-screen layer with a panel: title, message and stacked buttons. Blocks input below it. */
export class Modal extends Container {
  private readonly shade = new Graphics();
  private readonly box = new Container();
  private readonly panel = new Graphics();
  private readonly title: Text;
  private readonly message: Text;
  private readonly buttons: Button[];

  constructor(title: string, message: string, actions: ModalAction[]) {
    super();
    this.title = new Text({
      text: title,
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '800',
        fontSize: 26,
        fill: theme.text,
        align: 'center',
        wordWrap: true,
      },
    });
    this.message = new Text({
      text: message,
      style: {
        fontFamily: theme.fontFamily,
        fontSize: 16,
        lineHeight: 22,
        fill: theme.textMuted,
        align: 'center',
        wordWrap: true,
      },
    });
    this.title.anchor.set(0.5, 0);
    this.message.anchor.set(0.5, 0);
    this.buttons = actions.map((action) => new Button(action));

    this.shade.eventMode = 'static';
    this.box.addChild(this.panel, this.title, this.message, ...this.buttons);
    this.addChild(this.shade, this.box);
  }

  layout(screenWidth: number, screenHeight: number): void {
    this.shade
      .clear()
      .rect(-OVERSCAN, -OVERSCAN, screenWidth + OVERSCAN * 2, screenHeight + OVERSCAN * 2)
      .fill({ color: 0x000000, alpha: 0.65 });

    const width = Math.min(screenWidth - 32, 360);
    const inner = width - PADDING * 2;
    this.title.style.wordWrapWidth = inner;
    this.message.style.wordWrapWidth = inner;

    let y = PADDING;
    this.title.position.set(width / 2, y);
    y += this.title.height + 10;
    this.message.position.set(width / 2, y);
    y += this.message.height + PADDING;
    for (const button of this.buttons) {
      button.position.set(PADDING, y);
      button.layout(inner, BUTTON_HEIGHT);
      y += BUTTON_HEIGHT + BUTTON_GAP;
    }
    const height = y - BUTTON_GAP + PADDING;

    this.panel
      .clear()
      .roundRect(0, 0, width, height, 18)
      .fill(theme.panel)
      .stroke({ width: 2, color: theme.boardFrame, alpha: 0.7 });
    this.box.pivot.set(width / 2, height / 2);
    this.box.position.set(screenWidth / 2, screenHeight / 2);
  }

  /** Fades the shade in and pops the panel. */
  show(): void {
    gsap.fromTo(this, { alpha: 0 }, { alpha: 1, duration: 0.25 });
    gsap.fromTo(this.box.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this, this.box.scale);
    super.destroy(options);
  }
}
