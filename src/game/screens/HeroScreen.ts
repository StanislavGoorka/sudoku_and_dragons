import { Container, Graphics, Text } from 'pixi.js';
import { HERO_CLASSES, HERO_IDS, type HeroClass } from '../combat/hero.ts';
import { chosenHero } from '../combat/heroChoice.ts';
import { characterName, questExperience, storyLevel, storyTitle } from '../progress/character.ts';
import { chosenSkin } from '../progress/progress.ts';
import { progress, saveProgress } from '../progress/store.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { drawPanel } from '../ui/panel.ts';
import { WarriorView } from '../ui/WarriorView.ts';
import { TextField } from '../ui/TextField.ts';

const label = (text: string, fontSize: number, fill: number, wordWrap = false) => new Text({ text, style: {
  fontFamily: theme.fontFamily, fontSize, fill, wordWrap, lineHeight: fontSize + 5,
} });

export class HeroScreen extends Container {
  private readonly back: Button;
  private readonly tabs: Button[];
  private readonly equip: Button;
  private readonly title = label('Klasa postaci', 27, theme.text);
  private readonly intro = label('', 14, theme.textMuted);
  private readonly nameField: TextField;
  private readonly panel = new Graphics();
  private readonly preview = new WarriorView(chosenSkin(progress).design);
  private readonly heading = label('', 22, theme.gold);
  private readonly passive = label('', 15, theme.text, true);
  private readonly active = label('', 15, theme.text, true);
  private readonly arena = label('', 14, theme.text, true);
  private readonly focus = label('Skupienie: +1 za poprawną cyfrę, +1 gdy ruch coś domyka. Zdolność kosztuje 5.', 14, theme.textMuted, true);
  private readonly hint = label('Klasa obowiązuje od następnej walki. Wyzwanie dnia jest bez klas.', 13, theme.textMuted, true);
  private viewed = progress.character?.classId ?? chosenHero();
  private widthPx = 0;
  private heightPx = 0;

  constructor(private readonly onBack: () => void, private readonly creating = false) {
    super();
    this.title.style.fontFamily = theme.headingFontFamily;
    this.title.style.fontWeight = '700';
    this.title.text = creating ? 'Stwórz bohatera' : 'Twoja postać';
    const xp = questExperience(progress), level = storyLevel(xp);
    this.intro.text = `Fabuła · poz. ${level} · ${storyTitle(level)} · ${xp % 80}/80 XP`;
    for (const t of [this.title, this.intro]) t.anchor.set(.5, 0);
    this.back = new Button({ text: 'Wstecz', icon: 'back', onTap: onBack });
    this.back.visible = !creating;
    this.tabs = HERO_IDS.map(id => new Button({ text: HERO_CLASSES[id].name, onTap: () => { this.viewed = id; this.refresh(); } }));
    this.nameField = new TextField({ caption: 'Imię bohatera', type: 'text', autocomplete: 'nickname', maxLength: 20,
      value: progress.character?.name ?? '', placeholder: 'np. Arin', onEnter: () => this.save() });
    this.equip = new Button({ text: creating ? 'Stwórz postać' : 'Zapisz postać', variant: 'primary', onTap: () => this.save() });
    this.addChild(this.panel, this.title, this.intro, this.preview, this.heading, this.passive, this.active, this.arena, this.focus, this.hint, this.back, ...this.tabs, this.nameField, this.equip);
    this.refresh();
  }

  private refresh(): void {
    const def = HERO_CLASSES[this.viewed];
    this.heading.text = def.name;
    this.heading.style.fill = def.color;
    this.passive.text = `Pasywna · ${def.passive}`;
    this.active.text = `Aktywna · ${def.active}`;
    this.arena.text = def.arena;
    this.tabs.forEach((b, i) => b.setVariant(this.viewed === HERO_IDS[i] ? 'primary' : 'secondary'));
    if (this.widthPx) this.layout(this.widthPx, this.heightPx);
  }

  layout(width: number, height: number): void {
    this.widthPx = width; this.heightPx = height;
    const column = Math.min(width - 28, 460), left = (width - column) / 2;
    this.back.position.set(12, 8); this.back.layout(48, 48);
    this.title.position.set(width / 2, 14); this.intro.position.set(width / 2, 57);
    const tabWidth = (column - 12) / 3;
    this.tabs.forEach((b, i) => { b.position.set(left + i * (tabWidth + 6), 84); b.layout(tabWidth, 48); });
    this.nameField.position.set(left, 140); this.nameField.layout(column);
    const top = 224;
    this.equip.position.set(left, height - 60); this.equip.layout(column, 48);
    this.hint.style.wordWrapWidth = column; this.hint.position.set(left, this.equip.y - this.hint.height - 8);
    const panelBottom = this.hint.y - 12;
    drawPanel(this.panel.clear(), left, top, column, Math.max(0, panelBottom - top));
    const inner = left + 14;
    for (const t of [this.passive, this.active, this.arena, this.focus]) t.style.wordWrapWidth = column - 28;
    const detailHeight = this.heading.height + this.passive.height + this.active.height + this.arena.height + this.focus.height + 34;
    const detailTop = Math.max(top + 8, panelBottom - detailHeight - 8);
    const artSize = Math.max(0, Math.min(150, detailTop - top - 15));
    this.preview.visible = artSize >= 36;
    this.preview.layout(artSize); this.preview.position.set(width / 2, detailTop - 9 - this.preview.footOffset());
    this.heading.position.set(inner, detailTop);
    this.passive.position.set(inner, this.heading.y + this.heading.height + 6);
    this.active.position.set(inner, this.passive.y + this.passive.height + 8);
    this.arena.position.set(inner, this.active.y + this.active.height + 6);
    this.focus.position.set(inner, this.arena.y + this.arena.height + 6);
  }

  update(): void {
    if (this.creating && progress.character) this.onBack();
    else this.nameField.syncInput();
  }
  private save(): void {
    const name = characterName(this.nameField.value);
    if (!name) {
      this.hint.text = 'Imię: od 2 do 20 znaków. Użyj liter, cyfr, spacji lub łącznika.';
      this.nameField.focus(); this.layout(this.widthPx, this.heightPx);
      return;
    }
    progress.character = { name, classId: this.viewed };
    saveProgress();
    this.onBack();
  }

  handleBack(): boolean { if (!this.creating) this.onBack(); return true; }
  handleKey(e: KeyboardEvent): void { if (e.key === 'Escape') this.handleBack(); }
}
