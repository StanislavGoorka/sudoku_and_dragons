import { Container, Graphics, Text } from 'pixi.js';
import { HERO_CLASSES, HERO_IDS, type HeroClass } from '../combat/hero.ts';
import { chooseHero, chosenHero } from '../combat/heroChoice.ts';
import { chosenSkin } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { drawPanel } from '../ui/panel.ts';
import { WarriorView } from '../ui/WarriorView.ts';

const label = (text: string, fontSize: number, fill: number, wordWrap = false) => new Text({ text, style: {
  fontFamily: theme.fontFamily, fontSize, fill, wordWrap, lineHeight: fontSize + 5,
} });

export class HeroScreen extends Container {
  private readonly back: Button;
  private readonly tabs: Button[];
  private readonly equip: Button;
  private readonly title = label('Klasa postaci', 27, theme.text);
  private readonly intro = label('Kampania i trening solo', 14, theme.textMuted);
  private readonly panel = new Graphics();
  private readonly preview = new WarriorView(chosenSkin(progress).design);
  private readonly heading = label('', 22, theme.gold);
  private readonly passive = label('', 15, theme.text, true);
  private readonly active = label('', 15, theme.text, true);
  private readonly focus = label('Skupienie: +1 za poprawną cyfrę, +1 gdy ruch coś domyka. Zdolność kosztuje 5.', 14, theme.textMuted, true);
  private readonly hint = label('Wybór działa od następnej walki. Wyzwanie dnia i pojedynki mają wspólne zasady.', 13, theme.textMuted, true);
  private viewed = chosenHero();
  private widthPx = 0;
  private heightPx = 0;

  constructor(private readonly onBack: () => void) {
    super();
    this.title.style.fontFamily = theme.headingFontFamily;
    this.title.style.fontWeight = '700';
    for (const t of [this.title, this.intro]) t.anchor.set(.5, 0);
    this.back = new Button({ text: 'Wstecz', icon: 'back', onTap: onBack });
    this.tabs = HERO_IDS.map(id => new Button({ text: HERO_CLASSES[id].name, onTap: () => { this.viewed = id; this.refresh(); } }));
    this.equip = new Button({ text: '', variant: 'primary', onTap: () => { chooseHero(this.viewed); this.preview.cast(); this.refresh(); } });
    this.addChild(this.panel, this.title, this.intro, this.preview, this.heading, this.passive, this.active, this.focus, this.hint, this.back, ...this.tabs, this.equip);
    this.refresh();
  }

  private refresh(): void {
    const def = HERO_CLASSES[this.viewed];
    this.heading.text = def.name;
    this.heading.style.fill = def.color;
    this.passive.text = `Pasywna · ${def.passive}`;
    this.active.text = `Aktywna · ${def.active}`;
    this.tabs.forEach((b, i) => b.setVariant(this.viewed === HERO_IDS[i] ? 'primary' : 'secondary'));
    const selected = this.viewed === chosenHero();
    this.equip.setText(selected ? 'Klasa wybrana' : `Wybierz: ${def.name}`);
    this.equip.setEnabled(!selected);
    if (this.widthPx) this.layout(this.widthPx, this.heightPx);
  }

  layout(width: number, height: number): void {
    this.widthPx = width; this.heightPx = height;
    const column = Math.min(width - 28, 460), left = (width - column) / 2;
    this.back.position.set(12, 8); this.back.layout(48, 48);
    this.title.position.set(width / 2, 14); this.intro.position.set(width / 2, 57);
    const tabWidth = (column - 12) / 3;
    this.tabs.forEach((b, i) => { b.position.set(left + i * (tabWidth + 6), 84); b.layout(tabWidth, 48); });
    const top = 145;
    this.equip.position.set(left, height - 60); this.equip.layout(column, 48);
    this.hint.style.wordWrapWidth = column; this.hint.position.set(left, this.equip.y - this.hint.height - 8);
    const panelBottom = this.hint.y - 12;
    drawPanel(this.panel.clear(), left, top, column, Math.max(0, panelBottom - top));
    const inner = left + 14;
    for (const t of [this.passive, this.active, this.focus]) t.style.wordWrapWidth = column - 28;
    const detailHeight = this.heading.height + this.passive.height + this.active.height + this.focus.height + 28;
    const detailTop = Math.max(top + 8, panelBottom - detailHeight - 8);
    const artSize = Math.max(20, Math.min(150, detailTop - top - 15));
    this.preview.layout(artSize); this.preview.position.set(width / 2, detailTop - 9 - this.preview.footOffset());
    this.heading.position.set(inner, detailTop);
    this.passive.position.set(inner, this.heading.y + this.heading.height + 6);
    this.active.position.set(inner, this.passive.y + this.passive.height + 8);
    this.focus.position.set(inner, this.active.y + this.active.height + 8);
  }

  handleBack(): boolean { this.onBack(); return true; }
  handleKey(e: KeyboardEvent): void { if (e.key === 'Escape') this.handleBack(); }
}
