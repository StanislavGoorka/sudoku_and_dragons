import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';

interface PadButton {
  root: Container;
  bg: Graphics;
  label: Text;
  /** All nine copies of this digit are on the board. */
  done: boolean;
}

export class NumberPad extends Container {
  private readonly buttons: PadButton[] = [];

  constructor(onDigit: (digit: number) => void) {
    super();
    for (let digit = 1; digit <= 9; digit++) {
      const root = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: String(digit),
        style: { fontFamily: theme.fontFamily, fontWeight: '700', fill: theme.text },
      });
      label.anchor.set(0.5);
      root.addChild(bg, label);
      root.eventMode = 'static';

      const button: PadButton = { root, bg, label, done: false };
      root.on('pointertap', () => {
        if (button.done) return;
        gsap.fromTo(root.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
        onDigit(digit);
      });
      this.buttons.push(button);
      this.addChild(root);
    }
  }

  layout(width: number, height: number): void {
    const gap = 6;
    const w = (width - gap * 8) / 9;
    this.buttons.forEach((button, i) => {
      // Pivot in the centre so the press animation scales around it.
      button.root.pivot.set(w / 2, height / 2);
      button.root.position.set(i * (w + gap) + w / 2, height / 2);
      button.root.hitArea = new Rectangle(0, 0, w, height);
      button.bg.clear().roundRect(0, 0, w, height, 10).fill(0xffffff);
      button.label.position.set(w / 2, height / 2);
      button.label.style.fontSize = Math.round(Math.min(w, height) * 0.55);
      this.paint(button);
    });
  }

  setDone(digit: number, done: boolean): void {
    const button = this.buttons[digit - 1];
    button.done = done;
    this.paint(button);
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(...this.buttons.map((button) => button.root.scale));
    super.destroy(options);
  }

  private paint(button: PadButton): void {
    button.bg.tint = button.done ? theme.padButtonDone : theme.padButton;
    button.label.alpha = button.done ? 0.25 : 1;
    button.root.cursor = button.done ? 'default' : 'pointer';
  }
}
