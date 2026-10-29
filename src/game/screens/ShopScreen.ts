import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions, type FillInput } from 'pixi.js';
import { generatePuzzle } from '../../core/index.ts';
import type { DragonDesign } from '../art/dragonArt.ts';
import { feedback } from '../audio/feedback.ts';
import { boardTheme } from '../boardThemes.ts';
import { dragonSkin } from '../dragonSkins.ts';
import { burst, stopEffects } from '../fx/effects.ts';
import { killTweens } from '../fx/tweens.ts';
import { syncProfile } from '../net/online.ts';
import {
  buy,
  canBuyNew,
  choose,
  COSMETIC_KINDS,
  COSMETICS,
  isChosen,
  owns,
  type Cosmetic,
  type CosmeticKind,
} from '../progress/progress.ts';
import { starsWord } from '../progress/rewardText.ts';
import { progress, saveProgress } from '../progress/store.ts';
import { theme } from '../theme.ts';
import { verticalGradient } from '../ui/Backdrop.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { DragonView } from '../ui/DragonView.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { Scene, SCENES } from '../ui/Scene.ts';
import { drawStar, StarCounter } from '../ui/stars.ts';

export interface ShopOptions {
  onBack: () => void;
  /** The shelf to open on; the last one looked at by default. */
  kind?: CosmeticKind;
}

/** What each shelf says about the looked-at item. */
const SHELVES: Record<CosmeticKind, { tab: string; inUse: string; owned: string; toBuy: string }> = {
  board: { tab: 'Plansze', inUse: 'Grasz na tej planszy', owned: 'Masz już ten motyw', toBuy: 'Kup, by grać na tej planszy' },
  dragon: { tab: 'Smoki', inUse: 'Walczy za Ciebie w pojedynkach', owned: 'Masz już tego smoka', toBuy: 'Rywale zobaczą go w pojedynkach' },
};

/** The shelf the shop opens on next time, for this run of the app. */
let lastKind: CosmeticKind = 'board';

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

/** The duel's sky, behind the dragons on their tiles. */
const SKY = verticalGradient(SCENES.duel.sky);

const SWATCH_GAP = 8;
const PAD_HEIGHT = 44;

/** What a swatch shows of its item: the tile's colours and a small picture on it. */
interface SwatchLook {
  lip: number;
  face: FillInput;
  /** Colour of the sparks when it is bought. */
  accent: number;
  picture: Container;
  layout(size: number): void;
}

/** A board theme: a tile in its tray colours holding one cell with a 5 in your digit colour. */
function themeLook(item: Cosmetic): SwatchLook {
  const c = boardTheme(item.id).colors;
  const cell = new Graphics();
  const digit = new Text({ text: '5', style: { fontFamily: theme.fontFamily, fontWeight: '800', fill: c.placed } });
  digit.anchor.set(0.5);
  const picture = new Container();
  picture.addChild(cell, digit);
  return {
    lip: c.frameLip,
    face: c.frame,
    accent: c.frame,
    picture,
    layout(size) {
      const radius = Math.min(12, size * 0.28);
      const inset = Math.max(4, size * 0.12);
      cell.clear().roundRect(inset, inset, size - inset * 2, size - inset * 2, Math.max(3, radius - inset / 2)).fill(c.cell);
      digit.style.fontSize = Math.round(size * 0.46);
      digit.position.set(size / 2, size / 2 + size * 0.03);
    },
  };
}

/** A dragon skin: the dragon, still, against the duel sky, facing right as yours does in a duel. */
function skinLook(item: Cosmetic): SwatchLook {
  const design = dragonSkin(item.id).design;
  const dragon = new DragonView(design, { idle: false });
  dragon.scale.x = -1;
  return {
    lip: theme.panelLip,
    face: SKY,
    accent: design.palette.body,
    picture: dragon,
    layout(size) {
      dragon.layout(size * 0.86);
      dragon.position.set(size / 2, size / 2 + size * 0.02);
    },
  };
}

/** A small tile for one item, with its price under it (or a tick once it is in use). */
class Swatch extends Container {
  readonly item: Cosmetic;
  /** Where the row of swatches stands; the previewed one rises a little above it. */
  baseY = 0;
  private readonly kind: CosmeticKind;
  private readonly look: SwatchLook;
  private readonly lip = new Graphics();
  private readonly face = new Graphics();
  /** Keeps the picture inside the tile. */
  private readonly clip = new Graphics();
  private readonly ring = new Graphics();
  private readonly badge = new Graphics();
  private readonly price: Text;
  private readonly priceStar = new Graphics();
  private size = 0;

  constructor(kind: CosmeticKind, item: Cosmetic, onTap: () => void) {
    super();
    this.kind = kind;
    this.item = item;
    this.look = kind === 'board' ? themeLook(item) : skinLook(item);
    this.look.picture.mask = this.clip;
    this.price = new Text({
      text: String(item.price),
      style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 14, fill: theme.text },
    });
    this.price.anchor.set(0, 0.5);
    this.addChild(this.ring, this.lip, this.face, this.clip, this.look.picture, this.badge, this.priceStar, this.price);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', onTap);
  }

  get accent(): number {
    return this.look.accent;
  }

  layout(size: number): void {
    this.size = size;
    const radius = Math.min(12, size * 0.28);
    this.lip.clear().roundRect(0, 4, size, size, radius).fill(this.look.lip);
    this.face.clear().roundRect(0, 0, size, size, radius).fill(this.look.face);
    this.clip.clear().roundRect(0, 0, size, size, radius).fill(0xffffff);
    this.look.layout(size);
    this.hitArea = new Rectangle(-SWATCH_GAP / 2, -6, size + SWATCH_GAP, size + 34);
  }

  /** `previewed`: shown in the preview right now; the badge and price follow what the player owns. */
  refresh(previewed: boolean): void {
    const size = this.size;
    const owned = owns(progress, this.kind, this.item);
    this.ring.clear();
    if (previewed) this.ring.roundRect(-4, -4, size + 8, size + 12, 15).stroke({ width: 3, color: 0xffffff });
    this.badge.clear();
    if (isChosen(progress, this.kind, this.item)) {
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
      this.price.style.fill = progress.stars >= this.item.price ? theme.text : theme.textMuted;
    }
    this.y = this.baseY - (previewed ? 3 : 0);
  }

  center(): { x: number; y: number } {
    return { x: this.x + this.size / 2, y: this.y + this.size / 2 };
  }
}

/** The two shelves as one pill split in halves, the open one gold; a dot on the other when the stars buy something there. */
class ShelfTabs extends Container {
  private readonly track = new Graphics();
  private readonly tabs: { kind: CosmeticKind; tab: Container; face: Graphics; text: Text; dot: Graphics }[];
  private selected: CosmeticKind;
  private tabsWidth = 0;
  private tabsHeight = 0;

  constructor(selected: CosmeticKind, onSelect: (kind: CosmeticKind) => void) {
    super();
    this.selected = selected;
    this.addChild(this.track);
    this.tabs = COSMETIC_KINDS.map((kind) => {
      const tab = new Container();
      const face = new Graphics();
      const text = new Text({
        text: SHELVES[kind].tab,
        style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 17, fill: theme.text },
      });
      text.anchor.set(0.5);
      const dot = new Graphics();
      tab.addChild(face, text, dot);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointertap', () => onSelect(kind));
      this.addChild(tab);
      return { kind, tab, face, text, dot };
    });
  }

  layout(width: number, height: number): void {
    this.tabsWidth = width;
    this.tabsHeight = height;
    this.refresh();
  }

  select(kind: CosmeticKind): void {
    this.selected = kind;
    this.refresh();
  }

  refresh(): void {
    const w = this.tabsWidth;
    const h = this.tabsHeight;
    const half = w / 2;
    const inset = 4;
    this.track.clear().roundRect(0, 0, w, h, h / 2).fill({ color: theme.panelLip, alpha: 0.85 });
    this.tabs.forEach(({ kind, tab, face, text, dot }, i) => {
      const open = kind === this.selected;
      tab.position.set(i * half, 0);
      tab.hitArea = new Rectangle(0, 0, half, h);
      face.clear();
      if (open) face.roundRect(inset, inset, half - inset * 2, h - inset * 2, (h - inset * 2) / 2).fill(theme.gold);
      text.style.fill = open ? theme.buttonPrimaryText : theme.text;
      text.position.set(half / 2, h / 2);
      dot.clear();
      if (!open && canBuyNew(progress, kind)) {
        dot.circle(half / 2 + text.width / 2 + 7, h / 2 - 9, 5).fill(theme.gold).stroke({ width: 2, color: theme.panelLip });
      }
    });
  }
}

/** The dragon shelf's preview: the looked-at skin hovering over the duel scene, facing right like yours. */
class DragonPreview extends Container {
  private readonly scene = new Scene(SCENES.duel);
  private dragon: DragonView;
  private design: DragonDesign;
  private sceneWidth = 0;
  private sceneHeight = 0;

  constructor(design: DragonDesign) {
    super();
    this.design = design;
    this.dragon = this.makeDragon(design);
    this.addChild(this.scene, this.dragon);
  }

  layout(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    this.scene.layout(width, height, 22);
    this.placeDragon();
  }

  show(design: DragonDesign): void {
    if (design === this.design) return;
    this.design = design;
    this.dragon.destroy({ children: true });
    this.dragon = this.makeDragon(design);
    this.addChild(this.dragon);
    this.placeDragon();
  }

  attack(): void {
    void this.dragon.attack();
  }

  private makeDragon(design: DragonDesign): DragonView {
    const dragon = new DragonView(design);
    dragon.scale.x = -1;
    return dragon;
  }

  private placeDragon(): void {
    if (this.sceneHeight === 0) return;
    const ground = this.scene.groundY() + 4;
    this.dragon.layout(Math.min(this.sceneHeight * 0.72, this.sceneWidth * 0.75));
    this.dragon.position.set(this.sceneWidth / 2, ground - this.dragon.footOffset());
  }
}

/**
 * The shop: board themes and dragon skins, bought with stars. Each shelf shows the looked-at item
 * big (the board and number pad in its colours, or the dragon over the duel scene), a row of items
 * to pick from (tap, swipe the preview, or the arrow keys), and one button that buys the item or
 * puts on one already bought.
 */
export class ShopScreen extends Container {
  private readonly options: ShopOptions;
  private readonly backButton: Button;
  private readonly tabs: ShelfTabs;
  private readonly stars = new StarCounter(progress.stars);
  /** The looked-at item, big; it takes no taps but a swipe (and on the dragon shelf a tap, to see it attack). */
  private readonly preview = new Container();
  private readonly boardPreview = new Container();
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  private readonly dragonPreview: DragonPreview;
  private swatches: Swatch[] = [];
  private readonly itemName = new Text({
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
  private kind: CosmeticKind;
  private index = 0;
  private swipeFrom: number | null = null;
  /** The balance shown while the counter runs down after a purchase. */
  private readonly shownStars = { value: progress.stars };
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(options: ShopOptions) {
    super();
    this.options = options;
    this.kind = options.kind ?? lastKind;
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.tabs = new ShelfTabs(this.kind, (kind) => this.openShelf(kind));
    this.itemName.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);

    const colors = boardTheme(progress.boardTheme).colors;
    this.board = new BoardView(SAMPLE.givens, colors);
    this.board.sync(SAMPLE_PLACED);
    this.board.select(SAMPLE_SELECTED);
    this.pad = new NumberPad(() => {}, colors);
    for (let digit = 1; digit <= 9; digit++) this.pad.setDone(digit, this.board.countOf(digit) === 9);
    this.boardPreview.addChild(this.board, this.pad);
    this.dragonPreview = new DragonPreview(dragonSkin(progress.dragonSkin).design);
    this.preview.addChild(this.boardPreview, this.dragonPreview);
    this.preview.interactiveChildren = false;
    this.preview.eventMode = 'static';
    this.preview.cursor = 'pointer';
    this.preview.on('pointerdown', (event) => (this.swipeFrom = event.global.x));
    this.preview.on('pointerup', (event) => this.endSwipe(event.global.x));
    this.preview.on('pointerupoutside', (event) => this.endSwipe(event.global.x));

    this.actionButton = new Button({ text: '', variant: 'primary', onTap: () => this.act() });
    this.fx.eventMode = 'none';

    this.addChild(this.preview, this.itemName, this.status, this.actionButton, this.tabs, this.stars, this.backButton, this.fx);
    this.fillShelf();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    const margin = 16;
    const column = Math.min(width - margin * 2, 440);
    const left = (width - column) / 2;
    this.backButton.position.set(margin, 12);
    this.backButton.layout(44, 44);
    this.stars.layout(42);
    this.stars.position.set(width - margin - this.stars.pillWidth, 13);
    // The tabs in the middle of the screen, if the back button and the stars leave room.
    const tabsLeft = margin + 44 + 10;
    const tabsRight = width - margin - this.stars.pillWidth - 10;
    const tabsWidth = Math.min(260, tabsRight - tabsLeft);
    this.tabs.position.set(Math.max(tabsLeft, Math.min(tabsRight - tabsWidth, width / 2 - tabsWidth / 2)), 12);
    this.tabs.layout(tabsWidth, 44);

    // From the bottom up: the button, the item's name and status, the swatches; the preview gets the rest.
    const buttonHeight = 66;
    const buttonY = height - margin - buttonHeight;
    this.actionButton.position.set(left, buttonY);
    this.actionButton.layout(column, buttonHeight);
    const statusY = buttonY - 12 - 22;
    const nameY = statusY - 34;
    this.status.position.set(width / 2, statusY);
    this.itemName.position.set(width / 2, nameY);

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
    const room = swatchY - 22 - top;
    let previewWidth: number;
    let previewHeight: number;
    if (this.kind === 'board') {
      const border = BoardView.BORDER;
      const boardSize = Math.max(120, Math.min(column - border * 2, room - border * 2 - 5 - 10 - PAD_HEIGHT));
      previewWidth = boardSize + border * 2;
      previewHeight = previewWidth + 5 + 10 + PAD_HEIGHT;
      this.board.position.set(border, border);
      this.board.layout(boardSize);
      this.pad.position.set(0, previewWidth + 5 + 10);
      this.pad.layout(previewWidth, PAD_HEIGHT);
    } else {
      previewWidth = column;
      previewHeight = Math.max(160, Math.min(room, column * 1.05));
      this.dragonPreview.layout(previewWidth, previewHeight);
    }
    // Pivot in the middle, so the preview pops in place after a purchase.
    this.preview.pivot.set(previewWidth / 2, previewHeight / 2);
    this.preview.position.set(width / 2, top + Math.max(0, room - previewHeight) / 2 + previewHeight / 2);
    this.preview.hitArea = new Rectangle(0, 0, previewWidth, previewHeight);
    this.refreshSwatches();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.options.onBack();
    else if (event.key === 'ArrowLeft') this.look(this.index - 1);
    else if (event.key === 'ArrowRight') this.look(this.index + 1);
    else if (event.key === 'Enter') this.act();
    else if (event.key === 'Tab') {
      event.preventDefault();
      this.openShelf(this.kind === 'board' ? 'dragon' : 'board');
    }
  }

  handleBack(): boolean {
    this.options.onBack();
    return true;
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.preview.scale, this.itemName.scale, this.shownStars);
    stopEffects(this.fx);
    super.destroy(options);
  }

  private get items(): readonly Cosmetic[] {
    return COSMETICS[this.kind];
  }

  private get previewed(): Cosmetic {
    return this.items[this.index];
  }

  private openShelf(kind: CosmeticKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    lastKind = kind;
    feedback.select();
    this.fillShelf();
    if (this.screenWidth > 0) this.layout(this.screenWidth, this.screenHeight);
  }

  /** The open shelf's swatches and preview, starting at the item in use. */
  private fillShelf(): void {
    for (const swatch of this.swatches) swatch.destroy({ children: true });
    this.swatches = this.items.map((item, i) => new Swatch(this.kind, item, () => this.look(i)));
    for (const swatch of this.swatches) this.addChildAt(swatch, this.getChildIndex(this.itemName));
    this.index = Math.max(0, this.items.findIndex((item) => isChosen(progress, this.kind, item)));
    this.boardPreview.visible = this.kind === 'board';
    this.dragonPreview.visible = this.kind === 'dragon';
    this.tabs.select(this.kind);
    this.showItem();
  }

  private look(index: number): void {
    const next = Math.max(0, Math.min(this.items.length - 1, index));
    if (next === this.index) return;
    this.index = next;
    feedback.select();
    this.showItem();
    gsap.fromTo(this.itemName.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  private endSwipe(x: number): void {
    if (this.swipeFrom === null) return;
    const dx = x - this.swipeFrom;
    this.swipeFrom = null;
    if (Math.abs(dx) > 40) {
      this.look(this.index + (dx < 0 ? 1 : -1));
    } else if (Math.abs(dx) < 10 && this.kind === 'dragon') {
      // A tap on the dragon: it shows off its attack.
      feedback.dragonLunge();
      this.dragonPreview.attack();
    }
  }

  /** Shows the looked-at item in the preview and says what the button will do with it. */
  private showItem(): void {
    const item = this.previewed;
    if (this.kind === 'board') {
      const colors = boardTheme(item.id).colors;
      this.board.setColors(colors);
      this.pad.setColors(colors);
    } else {
      this.dragonPreview.show(dragonSkin(item.id).design);
    }
    this.itemName.text = item.name;
    const shelf = SHELVES[this.kind];
    const owned = owns(progress, this.kind, item);
    const inUse = isChosen(progress, this.kind, item);
    const missing = item.price - progress.stars;
    if (inUse) {
      this.status.text = shelf.inUse;
      this.actionButton.setText('W użyciu');
    } else if (owned) {
      this.status.text = shelf.owned;
      this.actionButton.setText('Użyj');
    } else {
      this.status.text = missing > 0 ? `Brakuje Ci ${missing} ${starsWord(missing)}` : shelf.toBuy;
      this.actionButton.setText(`Kup za ${item.price} ${starsWord(item.price)}`);
    }
    this.actionButton.setEnabled(!inUse && (owned || missing <= 0));
    this.refreshSwatches();
  }

  private refreshSwatches(): void {
    this.swatches.forEach((view, i) => view.refresh(i === this.index));
    this.tabs.refresh();
  }

  /** The button: buy the looked-at item, or put it on. */
  private act(): void {
    const item = this.previewed;
    const kind = this.kind;
    if (isChosen(progress, kind, item)) return;
    if (owns(progress, kind, item)) {
      choose(progress, kind, item);
      this.saveChange();
      feedback.tap();
      this.showItem();
      this.pop();
      return;
    }
    const before = progress.stars;
    if (buy(progress, kind, item) !== 'bought') return;
    this.saveChange();
    feedback.purchase();
    this.showItem();
    this.pop();
    // The counter runs down to the new balance; sparks fly off the bought swatch.
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
    burst(this.fx, swatch.center(), swatch.accent, 10);
  }

  /** Saves what was bought or put on; a new dragon skin also goes to the server, for rivals to see. */
  private saveChange(): void {
    saveProgress();
    if (this.kind === 'dragon') syncProfile();
  }

  /** The preview pops; a dragon also lunges, proud of its new look. */
  private pop(): void {
    gsap.fromTo(this.preview.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)' });
    if (this.kind === 'dragon') this.dragonPreview.attack();
  }
}
