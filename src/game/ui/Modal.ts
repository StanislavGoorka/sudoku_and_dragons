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

/** Something drawn between the title and the message, e.g. the stars a battle won. */
export interface ModalExtra {
  view: Container;
  height: number;
  layout(width: number): void;
}

const PADDING = 24;
const BUTTON_HEIGHT = 56;
/** The panel's darker lip below it. */
const LIP = 7;
const BUTTON_GAP = 10;

/** A dimmed full-screen layer with a panel: title, optional extra, message and stacked buttons. Blocks input below it. */
export class Modal extends Container {
  private readonly shade = new Graphics();
  private readonly box = new Container();
  private readonly panel = new Graphics();
  private readonly title: Text;
  private readonly message: Text;
  private readonly buttons: Button[];
  private readonly extra: ModalExtra | null;
  private screenWidth = 0;
  private screenHeight = 0;

  /** `titleColor`: gold for a win, for example. */
  constructor(title: string, message: string, actions: ModalAction[], titleColor: number = theme.text, extra?: ModalExtra) {
    super();
    this.title = new Text({
      text: title,
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '800',
        fontSize: 30,
        lineHeight: 34,
        fill: titleColor,
        stroke: { color: theme.panelLip, width: 4, join: 'round' },
        align: 'center',
        wordWrap: true,
      },
    });
    this.message = new Text({
      text: message,
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '500',
        fontSize: 17,
        lineHeight: 22,
        fill: theme.textMuted,
        align: 'center',
        wordWrap: true,
      },
    });
    this.title.anchor.set(0.5, 0);
    this.message.anchor.set(0.5, 0);
    this.buttons = actions.map((action) => new Button(action));
    this.extra = extra ?? null;

    this.shade.eventMode = 'static';
    this.box.addChild(this.panel, this.title, this.message, ...this.buttons);
    if (this.extra) this.box.addChild(this.extra.view);
    this.addChild(this.shade, this.box);
  }

  layout(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.shade
      .clear()
      .rect(-OVERSCAN, -OVERSCAN, screenWidth + OVERSCAN * 2, screenHeight + OVERSCAN * 2)
      .fill({ color: theme.background, alpha: 0.75 });

    const width = Math.min(screenWidth - 32, 360);
    const inner = width - PADDING * 2;
    this.title.style.wordWrapWidth = inner;
    this.message.style.wordWrapWidth = inner;

    let y = PADDING;
    this.title.position.set(width / 2, y);
    y += this.title.height + 10;
    if (this.extra) {
      this.extra.view.position.set(PADDING, y);
      this.extra.layout(inner);
      y += this.extra.height + 8;
    }
    this.message.position.set(width / 2, y);
    y += this.message.text ? this.message.height + PADDING : PADDING / 2;
    for (const button of this.buttons) {
      button.position.set(PADDING, y);
      button.layout(inner, BUTTON_HEIGHT);
      y += BUTTON_HEIGHT + BUTTON_GAP;
    }
    const height = y - BUTTON_GAP + PADDING;

    this.panel
      .clear()
      .roundRect(0, LIP, width, height, 24)
      .fill(theme.panelLip)
      .roundRect(0, 0, width, height, 24)
      .fill(theme.panel)
      .stroke({ width: 3, color: theme.panelLight });
    this.box.pivot.set(width / 2, height / 2);
    this.box.position.set(screenWidth / 2, screenHeight / 2);
  }

  /** Replaces the message, e.g. when the rival answers while the dialog is open. */
  setMessage(message: string): void {
    this.message.text = message;
    this.layout(this.screenWidth, this.screenHeight);
  }

  /** The button made from `actions[index]`, to relabel or disable it. */
  button(index: number): Button {
    return this.buttons[index];
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
