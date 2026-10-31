import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import { uiTheme as theme } from '../uiTheme.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'accent';
export type ButtonIcon = 'pause' | 'back' | 'gear' | 'palette' | 'user' | 'map' | 'pencil' | 'speaker' | 'muted';
export interface ButtonOptions { text: string; icon?: ButtonIcon; subtitle?: string; variant?: ButtonVariant; onTap: () => void }
const COLORS = {
  primary: { face: theme.buttonPrimary, border: theme.buttonPrimaryLip, text: theme.buttonPrimaryText, subtitle: theme.buttonPrimaryText },
  secondary: { face: theme.buttonSecondary, border: theme.buttonSecondaryLip, text: theme.text, subtitle: theme.textMuted },
  accent: { face: theme.buttonAccent, border: theme.buttonAccentLip, text: 0xc5daf2, subtitle: 0x9cb4ce },
};

/** Flat controls with a thin border and a minimum 48 px target, independent of game-art themes. */
export class Button extends Container {
  private readonly face = new Container();
  private readonly faceBg = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text | null;
  private readonly icon: Graphics | null;
  private iconName: ButtonIcon | undefined;
  private colors: { face: number; border: number; text: number; subtitle: number };
  private buttonWidth = 0;
  private buttonHeight = 0;
  private highlighted = false;
  private enabled = true;

  constructor(options: ButtonOptions) {
    super(); this.colors = COLORS[options.variant ?? 'secondary'];
    this.title = new Text({ text: options.text, style: { fontFamily: theme.fontFamily, fontWeight: '600', fill: this.colors.text } });
    this.title.anchor.set(options.subtitle ? 0 : 0.5, 0.5);
    this.subtitle = options.subtitle ? new Text({ text: options.subtitle,
      style: { fontFamily: theme.fontFamily, fontWeight: '400', fill: this.colors.subtitle } }) : null;
    this.subtitle?.anchor.set(0, 0.5);
    this.iconName = options.icon; this.icon = options.icon ? new Graphics() : null;
    this.title.visible = !this.icon;
    this.face.addChild(this.faceBg, this.title);
    if (this.subtitle) this.face.addChild(this.subtitle);
    if (this.icon) this.face.addChild(this.icon);
    this.addChild(this.face); this.eventMode = 'static'; this.cursor = 'pointer';
    this.on('pointerdown', () => this.press(true));
    this.on('pointerup', () => this.press(false)); this.on('pointerupoutside', () => this.press(false));
    this.on('pointercancel', () => this.press(false));
    this.on('pointertap', () => { if (this.enabled) { feedback.tap(); options.onTap(); } });
  }
  layout(width: number, height: number): void {
    this.buttonWidth = width; this.buttonHeight = height;
    const targetWidth = Math.max(48, width), targetHeight = Math.max(48, height);
    this.hitArea = new Rectangle((width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
    this.title.style.fontSize = Math.round(Math.min(18, height * (this.subtitle ? 0.27 : 0.33)));
    this.title.position.set(this.subtitle ? 16 : width / 2, height * (this.subtitle ? 0.36 : 0.5));
    if (this.subtitle) { this.subtitle.style.fontSize = 12; this.subtitle.position.set(16, height * 0.72); }
    this.fitText(); this.draw();
  }
  setText(text: string): void { this.title.text = text; this.fitText(); }
  private fitText(): void {
    if (!this.buttonWidth) return;
    for (const label of [this.title, this.subtitle]) if (label) {
      label.scale.set(1); label.scale.set(Math.min(1, Math.max(1, this.buttonWidth - 32) / Math.max(1, label.width)));
    }
  }
  setIcon(icon: ButtonIcon): void { this.iconName = icon; if (this.buttonWidth) this.draw(); }
  setEnabled(enabled: boolean): void { this.enabled = enabled; this.alpha = enabled ? 1 : 0.45; this.cursor = enabled ? 'pointer' : 'default'; }
  setVariant(variant: ButtonVariant): void {
    this.colors = COLORS[variant]; this.title.style.fill = this.colors.text;
    if (this.subtitle) this.subtitle.style.fill = this.colors.subtitle;
    if (this.buttonWidth) this.draw();
  }
  setHighlighted(highlighted: boolean): void { this.highlighted = highlighted; this.draw(); }
  override destroy(options?: DestroyOptions): void { gsap.killTweensOf(this.face); super.destroy(options); }
  private draw(): void {
    const w = this.buttonWidth, h = this.buttonHeight;
    this.faceBg.clear().roundRect(0, 0, w, h, 9).fill(this.colors.face)
      .stroke({ width: this.highlighted ? 1.5 : 1, color: this.highlighted ? theme.buttonPrimary : this.colors.border });
    if (this.icon) this.drawIcon(this.icon, w / 2, h / 2, Math.min(11, h * 0.23));
  }
  private drawIcon(g: Graphics, x: number, y: number, r: number): void {
    g.clear();
    const line = { width: 1.7, color: this.colors.text, cap: 'round' as const, join: 'round' as const };
    switch (this.iconName) {
      case 'pause': g.moveTo(x - r * .4, y - r * .75).lineTo(x - r * .4, y + r * .75)
        .moveTo(x + r * .4, y - r * .75).lineTo(x + r * .4, y + r * .75).stroke(line); break;
      case 'back': g.moveTo(x + r * .25, y - r * .7).lineTo(x - r * .45, y).lineTo(x + r * .25, y + r * .7).stroke(line); break;
      case 'gear':
        g.circle(x, y, r * .72).stroke(line).circle(x, y, r * .25).stroke(line);
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(x + Math.cos(a) * r * .74, y + Math.sin(a) * r * .74)
          .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r).stroke(line); } break;
      case 'palette':
        g.circle(x, y, r).stroke(line);
        for (const [dx, dy] of [[-.4, -.3], [.3, -.45], [.45, .25], [-.3, .4]]) g.circle(x + dx * r, y + dy * r, r * .1).fill(this.colors.text);
        break;
      case 'map':
        g.poly([x - r, y - r * .7, x - r / 3, y - r, x + r / 3, y - r * .7, x + r, y - r,
          x + r, y + r * .7, x + r / 3, y + r, x - r / 3, y + r * .7, x - r, y + r]).stroke(line);
        g.moveTo(x - r / 3, y - r).lineTo(x - r / 3, y + r * .7).moveTo(x + r / 3, y - r * .7).lineTo(x + r / 3, y + r).stroke(line); break;
      case 'pencil':
        g.poly([x - r * .85, y + r * .9, x - r * .6, y + r * .2, x + r * .6, y - r,
          x + r, y - r * .6, x - r * .2, y + r * .6]).stroke(line); break;
      case 'user':
        g.circle(x, y - r * .4, r * .38).stroke(line);
        g.moveTo(x - r * .85, y + r * .9).bezierCurveTo(x - r * .85, y, x + r * .85, y, x + r * .85, y + r * .9).stroke(line); break;
      case 'speaker': case 'muted':
        g.poly([x - r, y - r * .3, x - r * .6, y - r * .3, x, y - r * .8, x, y + r * .8, x - r * .6, y + r * .3, x - r, y + r * .3]).stroke(line);
        if (this.iconName === 'muted') g.moveTo(x + r * .35, y - r * .3).lineTo(x + r * .9, y + r * .3)
          .moveTo(x + r * .9, y - r * .3).lineTo(x + r * .35, y + r * .3).stroke(line);
        else for (const d of [.5, .95]) g.moveTo(x + Math.cos(-.7) * r * d, y + Math.sin(-.7) * r * d).arc(x, y, r * d, -.7, .7).stroke(line);
    }
  }
  private press(down: boolean): void {
    if (this.enabled) gsap.to(this.face, { alpha: down ? .7 : 1, duration: .12, ease: 'power1.out' });
  }
}
