import gsap from 'gsap';
import { Container, Text, type DestroyOptions } from 'pixi.js';
import { CLUES, type Difficulty } from '../../core/index.ts';
import { DIFFICULTIES, DIFFICULTY_INFO } from '../difficulty.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';
import { DragonView } from '../ui/DragonView.ts';

export interface MenuOptions {
  /** Highlighted as the last choice. */
  selected: Difficulty;
  onPick: (difficulty: Difficulty) => void;
}

/** Start screen: title, the dragon, and one card per difficulty. */
export class MenuScreen extends Container {
  private readonly title = new Text({
    text: 'Sudoku\n& Dragons',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 40,
      lineHeight: 46,
      fill: theme.text,
      align: 'center',
    },
  });
  private readonly tagline = new Text({
    text: 'Rozwiązuj sudoku, pokonaj smoka',
    style: { fontFamily: theme.fontFamily, fontSize: 15, fill: theme.textMuted },
  });
  private readonly prompt = new Text({
    text: 'Wybierz poziom',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 16, fill: theme.text },
  });
  private readonly dragon = new DragonView();
  private readonly cards: Button[];
  private readonly onPick: (difficulty: Difficulty) => void;
  private entered = false;

  constructor(options: MenuOptions) {
    super();
    this.onPick = options.onPick;
    this.title.anchor.set(0.5, 0);
    this.tagline.anchor.set(0.5, 0);
    this.prompt.anchor.set(0.5, 0);
    this.cards = DIFFICULTIES.map((difficulty) => {
      const info = DIFFICULTY_INFO[difficulty];
      const card = new Button({
        text: info.name,
        subtitle: `${CLUES[difficulty]} podpowiedzi · ${info.tagline}`,
        onTap: () => this.onPick(difficulty),
      });
      card.setHighlighted(difficulty === options.selected);
      return card;
    });
    this.addChild(this.title, this.tagline, this.dragon, this.prompt, ...this.cards);
  }

  layout(width: number, height: number): void {
    killTweens(this.title, ...this.cards);
    this.title.alpha = 1;

    const margin = 24;
    const gap = 12;
    const contentWidth = Math.min(width - margin * 2, 400);
    const left = (width - contentWidth) / 2;
    const cardHeight = Math.round(Math.min(76, Math.max(60, height * 0.085)));
    const cardsTop = height - margin - cardHeight * 3 - gap * 2;

    this.cards.forEach((card, i) => {
      card.alpha = 1;
      card.position.set(left, cardsTop + i * (cardHeight + gap));
      card.layout(contentWidth, cardHeight);
    });
    this.prompt.position.set(width / 2, cardsTop - 32);

    const titleTop = Math.max(margin, height * 0.07);
    this.title.position.set(width / 2, titleTop);
    this.tagline.position.set(width / 2, titleTop + this.title.height + 8);

    const dragonTop = this.tagline.y + this.tagline.height + 16;
    const dragonBottom = this.prompt.y - 16;
    this.dragon.position.set(width / 2, (dragonTop + dragonBottom) / 2);
    this.dragon.layout(Math.max(48, Math.min(contentWidth * 0.7, dragonBottom - dragonTop)));

    if (!this.entered) {
      this.entered = true;
      this.playEntrance();
    }
  }

  handleKey(event: KeyboardEvent): void {
    const index = ['1', '2', '3'].indexOf(event.key);
    if (index >= 0) this.onPick(DIFFICULTIES[index]);
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.title, ...this.cards);
    super.destroy(options);
  }

  private playEntrance(): void {
    gsap.from(this.title, { alpha: 0, y: this.title.y - 20, duration: 0.5, ease: 'power2.out' });
    this.cards.forEach((card, i) => {
      gsap.from(card, { alpha: 0, y: card.y + 30, duration: 0.45, delay: 0.15 + i * 0.08, ease: 'power2.out' });
    });
  }
}
