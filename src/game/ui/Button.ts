import gsap from 'gsap';
import { Container, FillGradient, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { UiIcon } from './UiIcon.ts';
import type { UiIconName } from './iconCatalog.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'accent';
export type ButtonIcon = 'pause' | 'back' | 'gear' | 'palette' | 'user' | 'map' | 'pencil' | 'speaker' | 'muted';
export interface ButtonOptions {
  text: string; icon?: ButtonIcon; leadingIcon?: UiIconName; subtitle?: string; variant?: ButtonVariant; onTap: () => void;
}
const gradient = (top: number, bottom: number) => new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
  colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }], textureSpace: 'local' });
const COLORS = {
  primary: { fill: gradient(0xeedba5, theme.buttonPrimary), lip: theme.buttonPrimaryLip, border: 0xf4dc9f, text: theme.buttonPrimaryText, subtitle: 0x4e3b20 },
  secondary: { fill: gradient(theme.buttonSecondary, 0x23344f), lip: theme.buttonSecondaryLip, border: theme.panelLight, text: theme.text, subtitle: theme.textMuted },
  accent: { fill: gradient(0x426e98, theme.buttonAccent), lip: theme.buttonAccentLip, border: 0x7396b6, text: theme.text, subtitle: 0xc6d6e5 },
};

/** Game controls: a shallow metal rim, Kenney glyphs and a tactile face; targets remain at least 48 px. */
export class Button extends Container {
  private readonly footing = new Graphics();
  private readonly face = new Container();
  private readonly faceBg = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text | null;
  private readonly icon: UiIcon | Graphics | null;
  private readonly iconOnly: boolean;
  private colors: { fill: FillGradient; lip: number; border: number; text: number; subtitle: number } = COLORS.secondary;
  private buttonWidth = 0;
  private buttonHeight = 0;
  private highlighted = false;
  private enabled = true;
  private pressed = false;

  constructor(options: ButtonOptions) {
    super(); this.colors = COLORS[options.variant ?? 'secondary'];
    this.iconOnly = Boolean(options.icon);
    const name = options.icon ?? options.leadingIcon;
    this.icon = name === 'pencil' ? new Graphics() : name ? new UiIcon(name) : null;
    this.title = new Text({ text: options.text, style: { fontFamily: theme.fontFamily, fontWeight: '700', fill: this.colors.text } });
    this.title.anchor.set(options.subtitle ? 0 : .5, .5);
    this.subtitle = options.subtitle ? new Text({ text: options.subtitle,
      style: { fontFamily: theme.fontFamily, fontWeight: '400', fill: this.colors.subtitle } }) : null;
    this.subtitle?.anchor.set(0, .5);
    this.title.visible = !this.iconOnly;
    this.face.addChild(this.faceBg, this.title);
    if (this.subtitle) this.face.addChild(this.subtitle);
    if (this.icon) this.face.addChild(this.icon);
    this.addChild(this.footing, this.face); this.eventMode = 'static'; this.cursor = 'pointer';
    this.on('pointerdown', () => this.press(true));
    this.on('pointerup', () => this.press(false)); this.on('pointerupoutside', () => this.press(false));
    this.on('pointercancel', () => this.press(false));
    this.on('pointertap', () => { if (this.enabled) { feedback.tap(); options.onTap(); } });
  }
  layout(width: number, height: number): void {
    this.buttonWidth = width; this.buttonHeight = height;
    const targetWidth = Math.max(48, width), targetHeight = Math.max(48, height);
    this.hitArea = new Rectangle((width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
    this.title.style.fontSize = Math.round(Math.min(this.subtitle ? 16 : 19, height * .33));
    this.title.position.set(this.subtitle ? (this.icon ? 46 : 16) : width / 2 + (this.icon && !this.iconOnly ? 12 : 0), height * (this.subtitle ? .33 : .5));
    if (this.subtitle) { this.subtitle.style.fontSize = 12; this.subtitle.position.set(16, height * .73); }
    this.fitText(); this.draw();
  }
  setText(text: string): void { this.title.text = text; this.fitText(); this.placeIcon(); }
  private fitText(): void {
    if (!this.buttonWidth) return;
    for (const label of [this.title, this.subtitle]) if (label) {
      const inset = label === this.title && this.icon && !this.iconOnly ? (this.subtitle ? 60 : 72) : 32;
      label.scale.set(1); label.scale.set(Math.min(1, Math.max(1, this.buttonWidth - inset) / Math.max(1, label.width)));
    }
  }
  setIcon(icon: ButtonIcon): void { if (this.icon instanceof UiIcon && icon !== 'pencil') this.icon.setKind(icon); }
  setEnabled(enabled: boolean): void {
    if (!enabled) this.press(false);
    this.enabled = enabled; this.alpha = enabled ? 1 : .45; this.cursor = enabled ? 'pointer' : 'default';
  }
  setVariant(variant: ButtonVariant): void {
    this.colors = COLORS[variant]; this.title.style.fill = this.colors.text;
    if (this.subtitle) this.subtitle.style.fill = this.colors.subtitle;
    if (this.buttonWidth) this.draw();
  }
  setHighlighted(highlighted: boolean): void { this.highlighted = highlighted; this.draw(); }
  override destroy(options?: DestroyOptions): void { gsap.killTweensOf(this.face); super.destroy(options); }
  private draw(): void {
    const w = this.buttonWidth, h = this.buttonHeight, radius = 8;
    this.footing.clear().roundRect(0, 3, w, h - 1, radius).fill(this.colors.lip);
    this.faceBg.clear().roundRect(0, 0, w, h - 2, radius).fill(this.colors.fill)
      .stroke({ width: this.highlighted ? 2 : 1, color: this.highlighted ? theme.gold : this.colors.border })
      .moveTo(9, 2).lineTo(w - 9, 2).stroke({ width: 1, color: 0xffffff, alpha: .16 });
    this.placeIcon();
  }
  private placeIcon(): void {
    if (!this.icon) return;
    const x = this.iconOnly ? this.buttonWidth / 2 : this.subtitle ? 28 : this.buttonWidth / 2 - this.title.width / 2 - 13;
    const y = this.buttonHeight * (this.subtitle ? .33 : .5) - 1;
    this.icon.position.set(x, y);
    if (this.icon instanceof UiIcon) {
      this.icon.fit(this.iconOnly ? 21 : this.subtitle ? 19 : 20); this.icon.tint = this.colors.text;
    } else {
      const r = 10;
      this.icon.clear().poly([-r * .85, r * .9, -r * .6, r * .2, r * .6, -r, r, -r * .6, -r * .2, r * .6])
        .fill(this.colors.text).stroke({ width: 1, color: this.colors.text, join: 'round' });
    }
  }
  private press(down: boolean): void {
    if (!this.enabled || this.pressed === down) return;
    this.pressed = down;
    gsap.to(this.face, { y: down ? 2 : 0, duration: down ? .05 : .14, ease: 'power2.out' });
  }
}
