import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import type { BoardColors } from '../boardThemes.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';
import { padGeometry } from './padLayout.ts';

interface PadKey {
  root: Container;
  lip: Graphics;
  face: Container;
  bg: Graphics;
  label: Text;
  /** All nine copies of this digit are on the board. */
  done: boolean;
}

/** Nine chunky keys: two rows on phones, one on wide screens; a finished digit's key goes dark. */
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

  layout(width: number, height: number, preview = false): void {
    const geometry = padGeometry(width, height, preview);
    this.keyWidth = geometry[0].width;
    this.keyHeight = geometry[0].height;
    this.lipHeight = 0;
    this.keys.forEach((key, i) => {
      key.root.position.set(geometry[i].x, geometry[i].y);
      key.root.hitArea = new Rectangle(0, 0, this.keyWidth, this.keyHeight);
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
      key.label.style.fontSize = Math.max(16, Math.round(full * 0.65));
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
    const radius = 8;
    const c = this.colors;
    key.lip.clear();
    key.bg.clear().roundRect(0, 0, w, h, radius).fill(key.done ? c.padKeyDone : c.padKey);
    key.label.style.fill = key.done ? c.padDigitDone : c.padDigit;
    key.root.cursor = key.done ? 'default' : 'pointer';
  }
}
