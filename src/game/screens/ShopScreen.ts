import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { generatePuzzle } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { BOARD_THEMES, type BoardTheme } from '../boardThemes.ts';
import { burst, stopEffects } from '../fx/effects.ts';
import { killTweens } from '../fx/tweens.ts';
import { buyTheme, chooseTheme, chosenTheme, ownsTheme } from '../progress/progress.ts';
import { starsWord } from '../progress/rewardText.ts';
import { progress, saveProgress } from '../progress/store.ts';
import { theme } from '../theme.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { drawStar, StarCounter } from '../ui/stars.ts';

export interface ShopOptions {
  onBack: () => void;
}

/** The board shown in the preview: always the same one, partly solved. */
const SAMPLE = generatePuzzle(20261029, 'easy');
/** Its solved digits shown as the player's: every 5 (so one pad key shows as done) and a scatter of others. */
const SAMPLE_PLACED = SAMPLE.givens.map((given, cell) => (given === 0 && (SAMPLE.solution[cell] === 5 || cell % 4 === 1) ? SAMPLE.solution[cell] : given));
function fromMiddle(cell: number): number {
  return Math.abs(Math.floor(cell / 9) - 4) + Math.abs((cell % 9) - 4);
}
/** The preview selects the placed 5 nearest the middle, so its row, column, box and the other fives light up. */
const SAMPLE_SELECTED = SAMPLE_PLACED.map((digit, cell) => (digit === 5 && SAMPLE.givens[cell] === 0 ? cell : -1))
  .filter((cell) => cell >= 0)
  .sort((a, b) => fromMiddle(a) - fromMiddle(b))[0];

const SWATCH_GAP = 8;
const PAD_HEIGHT = 44;

/** A small tile in a theme's colours, with its price under it (or a tick once it is in use). */
class ThemeSwatch extends Container {
  readonly boardTheme: BoardTheme;
  /** Where the row of swatches stands; the previewed one rises a little above it. */
  baseY = 0;
  private readonly lip = new Graphics();
  private readonly face = new Graphics();
  private readonly ring = new Graphics();
  private readonly badge = new Graphics();
  private readonly digit: Text;
  private readonly price: Text;
  private readonly priceStar = new Graphics();
  private size = 0;

  constructor(boardTheme: BoardTheme, onTap: () => void) {
    super();
    this.boardTheme = boardTheme;
    this.digit = new Text({
      text: '5',
      style: { fontFamily: theme.fontFamily, fontWeight: '800', fill: boardTheme.colors.placed },
    });
    this.digit.anchor.set(0.5);
    this.price = new Text({
      text: String(boardTheme.price),
      style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 14, fill: theme.text },
    });
    this.price.anchor.set(0, 0.5);
    this.addChild(this.ring, this.lip, this.face, this.digit, this.badge, this.priceStar, this.price);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', onTap);
  }

  layout(size: number): void {
    this.size = size;
    const c = this.boardTheme.colors;
    const radius = Math.min(12, size * 0.28);
    this.lip.clear().roundRect(0, 4, size, size, radius).fill(c.frameLip);
    this.face.clear().roundRect(0, 0, size, size, radius).fill(c.frame);
    const inset = Math.max(4, size * 0.12);
    this.face.roundRect(inset, inset, size - inset * 2, size - inset * 2, Math.max(3, radius - inset / 2)).fill(c.cell);
    this.digit.style.fontSize = Math.round(size * 0.46);
    this.digit.position.set(size / 2, size / 2 + size * 0.03);
    this.hitArea = new Rectangle(-SWATCH_GAP / 2, -6, size + SWATCH_GAP, size + 34);
  }

  /** `previewed`: shown in the preview right now; the badge and price follow what the player owns. */
  refresh(previewed: boolean): void {
    const size = this.size;
    const owned = ownsTheme(progress, this.boardTheme);
    const inUse = progress.boardTheme === this.boardTheme.id;
    this.ring.clear();
    if (previewed) this.ring.roundRect(-4, -4, size + 8, size + 12, 15).stroke({ width: 3, color: 0xffffff });
    this.badge.clear();
    if (inUse) {
      const r = Math.max(8, size * 0.2);
      const x = size - r * 0.4;
      const y = r * 0.4;
      this.badge.circle(x, y, r).fill(theme.playerHp).stroke({ width: 2, color: 0xffffff });
      this.badge
        .moveTo(x - r * 0.45, y)
        .lineTo(x - r * 0.1, y + r * 0.38)
        .lineTo(x + r * 0.5, y - r * 0.35)
        .stroke({ width: r * 0.3, color: 0xffffff, cap: 'round', join: 'round' });
    }
    this.price.visible = !owned;
    this.priceStar.clear();
    if (!owned) {
      const y = size + 18;
      const width = 14 + this.price.width;
      drawStar(this.priceStar, size / 2 - width / 2 + 6, y, 6.5);
      this.price.position.set(size / 2 - width / 2 + 14, y + 1);
      this.price.style.fill = progress.stars >= this.boardTheme.price ? theme.text : theme.textMuted;
    }
    this.y = this.baseY - (previewed ? 3 : 0);
  }

  center(): { x: number; y: number } {
    return { x: this.x + this.size / 2, y: this.y + this.size / 2 };
  }
}

/**
 * The board theme shop: a live preview of the board and number pad in the theme being looked at,
 * a row of themes to pick from (tap, swipe the preview, or the arrow keys), and one button that buys
 * the theme with stars or puts on one already bought.
 */
export class ShopScreen extends Container {
  private readonly options: ShopOptions;
  private readonly backButton: Button;
  private readonly title = new Text({
    text: 'Motywy',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 34,
      fill: theme.text,
      stroke: { color: theme.panelLip, width: 6, join: 'round' },
    },
  });
  private readonly stars = new StarCounter(progress.stars);
  /** The board and pad in the previewed colours; it takes no taps. */
  private readonly preview = new Container();
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  private readonly swatches: ThemeSwatch[];
  private readonly themeName = new Text({
    text: '',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 28,
      fill: theme.text,
      stroke: { color: theme.panelLip, width: 5, join: 'round' },
    },
  });
  private readonly status = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '500', fontSize: 16, fill: theme.textMuted },
  });
  private readonly actionButton: Button;
  private readonly fx = new Container();
  private index: number;
  private swipeFrom: number | null = null;
  /** The balance shown while the counter runs down after a purchase. */
  private readonly shownStars = { value: progress.stars };

  constructor(options: ShopOptions) {
    super();
    this.options = options;
    this.index = BOARD_THEMES.indexOf(chosenTheme(progress));
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.title.anchor.set(0.5, 0);
    this.themeName.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);

    const colors = this.previewed.colors;
    this.board = new BoardView(SAMPLE.givens, colors);
    this.board.sync(SAMPLE_PLACED);
    this.board.select(SAMPLE_SELECTED);
    this.pad = new NumberPad(() => {}, colors);
    for (let digit = 1; digit <= 9; digit++) this.pad.setDone(digit, this.board.countOf(digit) === 9);
    this.preview.addChild(this.board, this.pad);
    this.preview.interactiveChildren = false;
    // Swipe the preview to look at the next or previous theme.
    this.preview.eventMode = 'static';
    this.preview.on('pointerdown', (event) => (this.swipeFrom = event.global.x));
    this.preview.on('pointerup', (event) => this.endSwipe(event.global.x));
    this.preview.on('pointerupoutside', (event) => this.endSwipe(event.global.x));

    this.swatches = BOARD_THEMES.map((boardTheme, i) => new ThemeSwatch(boardTheme, () => this.look(i)));
    this.actionButton = new Button({ text: '', variant: 'primary', onTap: () => this.act() });
    this.fx.eventMode = 'none';

    this.addChild(this.preview, ...this.swatches, this.themeName, this.status, this.actionButton, this.title, this.stars, this.backButton, this.fx);
    this.showTheme();
  }

  layout(width: number, height: number): void {
    const margin = 16;
    const column = Math.min(width - margin * 2, 440);
    const left = (width - column) / 2;
    this.backButton.position.set(margin, 12);
    this.backButton.layout(44, 44);
    this.title.position.set(width / 2, 10);
    this.stars.layout(42);
    this.stars.position.set(width - margin - this.stars.pillWidth, 13);

    // From the bottom up: the button, the theme's name and status, the swatches; the preview gets the rest.
    const buttonHeight = 66;
    const buttonY = height - margin - buttonHeight;
    this.actionButton.position.set(left, buttonY);
    this.actionButton.layout(column, buttonHeight);
    const statusY = buttonY - 12 - 22;
    const nameY = statusY - 34;
    this.status.position.set(width / 2, statusY);
    this.themeName.position.set(width / 2, nameY);

    const count = this.swatches.length;
    const swatch = Math.min(52, (column - SWATCH_GAP * (count - 1)) / count);
    const rowWidth = swatch * count + SWATCH_GAP * (count - 1);
    const swatchY = nameY - 14 - (swatch + 26);
    this.swatches.forEach((view, i) => {
      view.x = (width - rowWidth) / 2 + i * (swatch + SWATCH_GAP);
      view.baseY = swatchY;
      view.layout(swatch);
    });

    const top = 70;
    const border = BoardView.BORDER;
    const room = swatchY - 22 - top;
    const boardSize = Math.max(120, Math.min(column - border * 2, room - border * 2 - 5 - 10 - PAD_HEIGHT));
    const trayWidth = boardSize + border * 2;
    const previewHeight = trayWidth + 5 + 10 + PAD_HEIGHT;
    this.board.position.set(border, border);
    this.board.layout(boardSize);
    this.pad.position.set(0, trayWidth + 5 + 10);
    this.pad.layout(trayWidth, PAD_HEIGHT);
    // Pivot in the middle, so the preview pops in place after a purchase.
    this.preview.pivot.set(trayWidth / 2, previewHeight / 2);
    this.preview.position.set(width / 2, top + Math.max(0, room - previewHeight) / 2 + previewHeight / 2);
    this.preview.hitArea = new Rectangle(0, 0, trayWidth, previewHeight);
    this.refreshSwatches();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.options.onBack();
    else if (event.key === 'ArrowLeft') this.look(this.index - 1);
    else if (event.key === 'ArrowRight') this.look(this.index + 1);
    else if (event.key === 'Enter') this.act();
  }

  handleBack(): boolean {
    this.options.onBack();
    return true;
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.preview.scale, this.themeName.scale, this.shownStars);
    stopEffects(this.fx);
    super.destroy(options);
  }

  private get previewed(): BoardTheme {
    return BOARD_THEMES[this.index];
  }

  private look(index: number): void {
    const next = Math.max(0, Math.min(BOARD_THEMES.length - 1, index));
    if (next === this.index) return;
    this.index = next;
    feedback.select();
    this.showTheme();
    gsap.fromTo(this.themeName.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  private endSwipe(x: number): void {
    if (this.swipeFrom === null) return;
    const dx = x - this.swipeFrom;
    this.swipeFrom = null;
    if (Math.abs(dx) > 40) this.look(this.index + (dx < 0 ? 1 : -1));
  }

  /** Paints the preview in the looked-at theme and says what the button will do with it. */
  private showTheme(): void {
    const boardTheme = this.previewed;
    this.board.setColors(boardTheme.colors);
    this.pad.setColors(boardTheme.colors);
    this.themeName.text = boardTheme.name;
    const owned = ownsTheme(progress, boardTheme);
    const inUse = progress.boardTheme === boardTheme.id;
    const missing = boardTheme.price - progress.stars;
    if (inUse) {
      this.status.text = 'Grasz na tej planszy';
      this.actionButton.setText('W użyciu');
    } else if (owned) {
      this.status.text = 'Masz już ten motyw';
      this.actionButton.setText('Użyj');
    } else {
      this.status.text = missing > 0 ? `Brakuje Ci ${missing} ${starsWord(missing)}` : 'Kup, by grać na tej planszy';
      this.actionButton.setText(`Kup za ${boardTheme.price} ${starsWord(boardTheme.price)}`);
    }
    this.actionButton.setEnabled(!inUse && (owned || missing <= 0));
    this.refreshSwatches();
  }

  private refreshSwatches(): void {
    this.swatches.forEach((view, i) => view.refresh(i === this.index));
  }

  /** The button: buy the looked-at theme, or put it on. */
  private act(): void {
    const boardTheme = this.previewed;
    if (progress.boardTheme === boardTheme.id) return;
    if (ownsTheme(progress, boardTheme)) {
      chooseTheme(progress, boardTheme);
      saveProgress();
      feedback.tap();
      this.showTheme();
      this.pop();
      return;
    }
    const before = progress.stars;
    if (buyTheme(progress, boardTheme) !== 'bought') return;
    saveProgress();
    feedback.purchase();
    this.showTheme();
    this.pop();
    // The counter runs down to the new balance; gold sparks fly off the bought swatch.
    killTweens(this.shownStars);
    this.shownStars.value = before;
    gsap.to(this.shownStars, {
      value: progress.stars,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => this.stars.setValue(Math.round(this.shownStars.value)),
    });
    const swatch = this.swatches[this.index];
    burst(this.fx, swatch.center(), theme.gold, 18);
    burst(this.fx, swatch.center(), boardTheme.colors.frame, 10);
  }

  private pop(): void {
    gsap.fromTo(this.preview.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)' });
  }
}
