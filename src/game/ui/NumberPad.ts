import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import type { BoardColors } from '../boardThemes.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';

interface PadKey {
  root: Container;
  lip: Graphics;
  face: Container;
  bg: Graphics;
  label: Text;
  /** All nine copies of this digit are on the board. */
  done: boolean;
}

/** Nine chunky keys in a row, in the board theme's colours; a finished digit's key goes dark. */
export class NumberPad extends Container {
  private readonly keys: PadKey[] = [];
  private colors: BoardColors;
  private keyWidth = 0;
  private keyHeight = 0;
  private lipHeight = 0;
  /** Taps write notes: the digits shrink to the corner, like a note in a cell. */
  private notesMode = false;

  constructor(onDigit: (digit: number) => void, colors: BoardColors) {
    super();
    this.colors = colors;
    for (let digit = 1; digit <= 9; digit++) {
      const root = new Container();
      const lip = new Graphics();
      const face = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: String(digit),
        style: { fontFamily: theme.fontFamily, fontWeight: '800', fill: colors.padDigit },
      });
      label.anchor.set(0.5);
      face.addChild(bg, label);
      root.addChild(lip, face);
      root.eventMode = 'static';

      const key: PadKey = { root, lip, face, bg, label, done: false };
      root.on('pointerdown', () => {
        if (!key.done) gsap.to(face, { y: this.lipHeight * 0.75, duration: 0.05 });
      });
      const release = () => gsap.to(face, { y: 0, duration: 0.15, ease: 'power2.out' });
      root.on('pointerup', release);
      root.on('pointerupoutside', release);
      root.on('pointertap', () => {
        if (!key.done) onDigit(digit);
      });
      this.keys.push(key);
      this.addChild(root);
    }
  }

  layout(width: number, height: number): void {
    const gap = 5;
    this.keyWidth = (width - gap * 8) / 9;
    this.keyHeight = height;
    this.lipHeight = Math.max(3, Math.round(height * 0.08));
    this.keys.forEach((key, i) => {
      key.root.position.set(i * (this.keyWidth + gap), 0);
      key.root.hitArea = new Rectangle(0, 0, this.keyWidth, height);
      this.placeLabel(key);
      this.paint(key);
    });
  }

  /** In notes mode the keys write notes, and show it: small digits up in the corner. */
  setNotesMode(on: boolean): void {
    this.notesMode = on;
    if (this.keyWidth > 0) for (const key of this.keys) this.placeLabel(key);
  }

  private placeLabel(key: PadKey): void {
    const w = this.keyWidth;
    const h = this.keyHeight - this.lipHeight;
    const full = Math.round(Math.min(w * 0.75, this.keyHeight * 0.55));
    if (this.notesMode) {
      key.label.style.fontSize = Math.round(full * 0.6);
      key.label.position.set(w * 0.34, h * 0.32 + 2);
    } else {
      key.label.style.fontSize = full;
      key.label.position.set(w / 2, h / 2 + 2);
    }
  }

  /** Repaints the keys in other colours (the shop's preview). */
  setColors(colors: BoardColors): void {
    this.colors = colors;
    if (this.keyWidth > 0) for (const key of this.keys) this.paint(key);
  }

  setDone(digit: number, done: boolean): void {
    const key = this.keys[digit - 1];
    key.done = done;
    this.paint(key);
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(...this.keys.map((key) => key.face));
    super.destroy(options);
  }

  private paint(key: PadKey): void {
    const w = this.keyWidth;
    const h = this.keyHeight - this.lipHeight;
    const radius = Math.min(12, w * 0.3);
    const c = this.colors;
    key.lip.clear().roundRect(0, this.lipHeight, w, h, radius).fill(key.done ? c.padKeyDoneLip : c.padKeyLip);
    key.bg.clear().roundRect(0, 0, w, h, radius).fill(key.done ? c.padKeyDone : c.padKey);
    key.label.style.fill = key.done ? c.padDigitDone : c.padDigit;
    key.root.cursor = key.done ? 'default' : 'pointer';
  }
}
