import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { CLUES, ENEMIES, type Difficulty } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { DIFFICULTIES, DIFFICULTY_INFO, saveDifficulty } from '../difficulty.ts';
import { designOf } from '../enemies.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';
import { DragonView } from '../ui/DragonView.ts';
import { canBuyNew, isUnlocked, LEVELS } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { Modal } from '../ui/Modal.ts';
import { Scene, SCENES } from '../ui/Scene.ts';
import { drawStar, StarCounter } from '../ui/stars.ts';

export interface MenuOptions {
  /** The level shown first: the one played last. */
  selected: Difficulty;
  onPick: (difficulty: Difficulty) => void;
  onOnline: () => void;
  /** The star counter opens the progress screen. */
  onProgress: () => void;
  onShop: () => void;
}

const soundLabel = () => `Dźwięk: ${feedback.settings.sound ? 'włączony' : 'wyłączony'}`;
const hapticsLabel = () => `Wibracje: ${feedback.settings.haptics ? 'włączone' : 'wyłączone'}`;

/** One level on the stage: its scene with its dragon hovering over it (a dark shape behind a lock until unlocked). */
interface Stage {
  root: Container;
  scene: Scene;
  dragon: DragonView;
  lock: Graphics | null;
}

/** A gold padlock centred on (cx, cy), `size` tall. */
function drawLock(g: Graphics, cx: number, cy: number, size: number): Graphics {
  const edge = theme.buttonPrimaryLip;
  g.arc(cx, cy - size * 0.12, size * 0.26, Math.PI, 0).stroke({ width: size * 0.13, color: edge, cap: 'round' });
  g.roundRect(cx - size * 0.38, cy - size * 0.12, size * 0.76, size * 0.6, size * 0.14).fill(theme.gold).stroke({ width: size * 0.06, color: edge });
  g.circle(cx, cy + size * 0.1, size * 0.08).fill(theme.buttonPrimaryText);
  g.roundRect(cx - size * 0.03, cy + size * 0.12, size * 0.06, size * 0.16, size * 0.03).fill(theme.buttonPrimaryText);
  return g;
}

/**
 * Start screen, kept to a few things: the logo, one level at a time (its dragon in its scene,
 * flipped with the arrows or a swipe), a big "Walcz!" button, online duels, and a settings button.
 */
export class MenuScreen extends Container {
  private readonly titleTop = new Text({
    text: 'Sudoku',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 46,
      fill: theme.text,
      stroke: { color: theme.panelLip, width: 7, join: 'round' },
    },
  });
  private readonly titleBottom = new Text({
    text: '& Dragons',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 34,
      fill: theme.gold,
      stroke: { color: theme.panelLip, width: 6, join: 'round' },
    },
  });
  private readonly stageArea = new Container();
  private stage: Stage | null = null;
  private readonly prevButton: Button;
  private readonly nextButton: Button;
  private readonly levelName = new Text({
    text: '',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: 28,
      fill: theme.text,
      stroke: { color: theme.panelLip, width: 5, join: 'round' },
    },
  });
  private readonly levelInfo = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '500', fontSize: 16, fill: theme.textMuted },
  });
  /** The most stars won on the shown level. */
  private readonly bestStars = new Graphics();
  /** Stars to spend; tap for the progress screen. */
  private readonly starCounter: StarCounter;
  private readonly playButton: Button;
  private readonly onlineButton: Button;
  private readonly settingsButton: Button;
  /** Opens the shop (board themes, dragon skins); a gold dot on it when the stars buy something not owned yet. */
  private readonly shopButton: Button;
  private readonly shopDot = new Graphics();
  private modal: Modal | null = null;
  private readonly onPick: (difficulty: Difficulty) => void;
  private index: number;
  private stageWidth = 0;
  private stageHeight = 0;
  private screenWidth = 0;
  private screenHeight = 0;
  private entered = false;
  private swipeFrom: number | null = null;
  private starsY = 0;

  constructor(options: MenuOptions) {
    super();
    this.onPick = options.onPick;
    // The level played last, unless it is still locked (then the furthest open one).
    const open = LEVELS.filter((d) => isUnlocked(progress, d));
    this.index = DIFFICULTIES.indexOf(open.includes(options.selected) ? options.selected : open[open.length - 1]);
    this.starCounter = new StarCounter(progress.stars, options.onProgress);
    for (const text of [this.titleTop, this.titleBottom, this.levelName, this.levelInfo]) text.anchor.set(0.5, 0);

    this.prevButton = new Button({ text: 'Poprzedni', icon: 'back', onTap: () => this.flip(-1) });
    this.nextButton = new Button({ text: 'Następny', icon: 'back', onTap: () => this.flip(1) });
    this.playButton = new Button({ text: 'Walcz!', variant: 'primary', onTap: () => this.play(this.difficulty) });
    this.onlineButton = new Button({
      text: 'Pojedynek online',
      subtitle: 'gracz kontra gracz',
      variant: 'accent',
      onTap: options.onOnline,
    });
    this.settingsButton = new Button({ text: 'Ustawienia', icon: 'gear', onTap: () => this.openSettings() });
    this.shopButton = new Button({ text: 'Sklep', icon: 'palette', onTap: options.onShop });
    this.shopDot.visible = canBuyNew(progress);
    this.shopDot.circle(40, 5, 7).fill(theme.gold).stroke({ width: 2.5, color: theme.panelLip });
    this.shopDot.eventMode = 'none';
    this.shopButton.addChild(this.shopDot);

    // Swipe the stage left or right to change the level.
    this.stageArea.eventMode = 'static';
    this.stageArea.on('pointerdown', (event) => (this.swipeFrom = event.global.x));
    this.stageArea.on('pointerup', (event) => this.endSwipe(event.global.x));
    this.stageArea.on('pointerupoutside', (event) => this.endSwipe(event.global.x));

    this.addChild(
      this.titleTop,
      this.titleBottom,
      this.stageArea,
      this.prevButton,
      this.nextButton,
      this.bestStars,
      this.levelName,
      this.levelInfo,
      this.playButton,
      this.onlineButton,
      this.settingsButton,
      this.shopButton,
      this.starCounter,
    );
    this.showLevel(0);
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    killTweens(this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton);
    for (const item of [this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton]) item.alpha = 1;

    const margin = 16;
    const gap = 12;
    const column = Math.min(width - margin * 2, 420);
    const left = (width - column) / 2;

    this.settingsButton.position.set(width - margin - 44, 12);
    this.settingsButton.layout(44, 44);
    this.shopButton.position.set(width - margin - 44 - 10 - 44, 12);
    this.shopButton.layout(44, 44);
    this.starCounter.layout(42);
    this.starCounter.position.set(margin, 13);

    const titleTop = Math.max(18, height * 0.035);
    this.titleTop.position.set(width / 2, titleTop);
    this.titleBottom.position.set(width / 2, titleTop + this.titleTop.height * 0.78);

    // From the bottom up: online, play, level texts, dots; the stage takes what is left.
    const onlineHeight = 62;
    const playHeight = 70;
    const onlineY = height - margin - onlineHeight;
    const playY = onlineY - gap - playHeight;
    this.onlineButton.position.set(left, onlineY);
    this.onlineButton.layout(column, onlineHeight);
    this.playButton.position.set(left, playY);
    this.playButton.layout(column, playHeight);
    const infoY = playY - 16 - 22;
    this.starsY = infoY - 14;
    const nameY = this.starsY - 14 - 36;
    this.levelInfo.position.set(width / 2, infoY);
    this.levelName.position.set(width / 2, nameY);

    const stageTop = this.titleBottom.y + this.titleBottom.height + 14;
    this.stageWidth = column;
    this.stageHeight = Math.max(150, Math.min(400, nameY - 12 - stageTop));
    this.stageArea.position.set(left, stageTop);
    this.stageArea.hitArea = new Rectangle(0, 0, this.stageWidth, this.stageHeight);
    if (this.stage) this.layoutStage(this.stage);

    const arrow = 46;
    const arrowY = stageTop + this.stageHeight / 2 - arrow / 2;
    this.prevButton.position.set(Math.max(4, left - arrow / 2 + 4), arrowY);
    this.prevButton.layout(arrow, arrow);
    // The same arrow, mirrored, points right.
    this.nextButton.scale.x = -1;
    this.nextButton.position.set(Math.min(width - 4, left + column + arrow / 2 - 4), arrowY);
    this.nextButton.layout(arrow, arrow);
    this.drawBestStars();

    this.modal?.layout(width, height);
    if (!this.entered) {
      this.entered = true;
      this.playEntrance();
    }
  }

  handleKey(event: KeyboardEvent): void {
    if (this.modal) {
      if (event.key === 'Escape') this.closeModal();
      return;
    }
    const index = ['1', '2', '3'].indexOf(event.key);
    if (index >= 0) this.play(DIFFICULTIES[index]);
    else if (event.key === 'ArrowLeft') this.flip(-1);
    else if (event.key === 'ArrowRight') this.flip(1);
    else if (event.key === 'Enter') this.play(this.difficulty);
  }

  /** Back closes the settings; otherwise there is nothing to go back to (the app exits). */
  handleBack(): boolean {
    if (!this.modal) return false;
    this.closeModal();
    return true;
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton, this.levelName.scale);
    if (this.stage) killTweens(this.stage.root);
    super.destroy(options);
  }

  private get difficulty(): Difficulty {
    return DIFFICULTIES[this.index];
  }

  /** Starts a battle, if that level is open. */
  private play(difficulty: Difficulty): void {
    if (isUnlocked(progress, difficulty)) this.onPick(difficulty);
  }

  private flip(step: number): void {
    if (this.modal) return;
    this.index = (this.index + step + DIFFICULTIES.length) % DIFFICULTIES.length;
    saveDifficulty(this.difficulty);
    feedback.select();
    this.showLevel(step);
  }

  private endSwipe(x: number): void {
    if (this.swipeFrom === null) return;
    const dx = x - this.swipeFrom;
    this.swipeFrom = null;
    if (Math.abs(dx) > 40) this.flip(dx < 0 ? 1 : -1);
  }

  /** Puts the current level on the stage; `from` is the direction it slides in from (0: no slide). */
  private showLevel(from: number): void {
    const enemy = ENEMIES[this.difficulty];
    const old = this.stage;
    const root = new Container();
    const open = isUnlocked(progress, this.difficulty);
    const stage: Stage = {
      root,
      scene: new Scene(SCENES[enemy.id] ?? SCENES.dragon),
      dragon: new DragonView(designOf(enemy)),
      lock: open ? null : new Graphics(),
    };
    // A locked dragon is only a dark shape, still hovering.
    if (!open) stage.dragon.tint = 0x1b1338;
    root.addChild(stage.scene, stage.dragon);
    if (stage.lock) root.addChild(stage.lock);
    this.stageArea.addChild(root);
    this.stage = stage;
    if (this.stageWidth > 0) this.layoutStage(stage);

    if (old) {
      killTweens(old.root);
      if (from === 0) {
        old.root.destroy({ children: true });
      } else {
        gsap.to(old.root, {
          x: -from * 40,
          alpha: 0,
          duration: 0.2,
          ease: 'power2.in',
          onComplete: () => old.root.destroy({ children: true }),
        });
        gsap.fromTo(root, { x: from * 40, alpha: 0 }, { x: 0, alpha: 1, duration: 0.25, ease: 'power2.out' });
      }
    }

    this.levelName.text = DIFFICULTY_INFO[this.difficulty].name;
    const before = DIFFICULTIES[this.index - 1];
    this.levelInfo.text = open
      ? `${enemy.name} · ${CLUES[this.difficulty]} podpowiedzi`
      : `Wygraj najpierw poziom ${DIFFICULTY_INFO[before].name.toLowerCase()}`;
    this.playButton.setText(open ? 'Walcz!' : 'Zablokowany');
    this.playButton.setEnabled(open);
    if (from !== 0) gsap.fromTo(this.levelName.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    this.drawBestStars();
  }

  private layoutStage(stage: Stage): void {
    stage.scene.layout(this.stageWidth, this.stageHeight, 24);
    const ground = stage.scene.groundY() + 4;
    stage.dragon.layout(Math.max(48, Math.min(this.stageWidth * 0.8, (ground - 12) * 1.05)));
    stage.dragon.position.set(this.stageWidth / 2 + this.stageWidth * 0.03, ground - stage.dragon.footOffset());
    if (stage.lock) drawLock(stage.lock.clear(), this.stageWidth / 2, this.stageHeight * 0.45, Math.min(90, this.stageHeight * 0.3));
  }

  /** Three small stars under the level name: the most it has given (none shown while locked). */
  private drawBestStars(): void {
    this.bestStars.clear();
    if (this.screenWidth === 0 || !isUnlocked(progress, this.difficulty)) return;
    const best = progress.levels[this.difficulty].bestStars;
    for (let i = 0; i < 3; i++) drawStar(this.bestStars, this.screenWidth / 2 + (i - 1) * 26, this.starsY, 10, i < best);
  }

  private openSettings(): void {
    if (this.modal) return;
    const modal = new Modal('Ustawienia', '', [
      {
        text: soundLabel(),
        onTap: () => {
          feedback.setSound(!feedback.settings.sound);
          modal.button(0).setText(soundLabel());
        },
      },
      {
        text: hapticsLabel(),
        onTap: () => {
          feedback.setHaptics(!feedback.settings.haptics);
          modal.button(1).setText(hapticsLabel());
        },
      },
      { text: 'Gotowe', variant: 'primary', onTap: () => this.closeModal() },
    ]);
    this.modal = modal;
    this.addChild(modal);
    modal.layout(this.screenWidth, this.screenHeight);
    modal.show();
  }

  private closeModal(): void {
    this.modal?.destroy({ children: true });
    this.modal = null;
  }

  private playEntrance(): void {
    gsap.from(this.titleTop, { alpha: 0, y: this.titleTop.y - 24, duration: 0.5, ease: 'back.out(2)' });
    gsap.from(this.titleBottom, { alpha: 0, y: this.titleBottom.y - 24, duration: 0.5, delay: 0.08, ease: 'back.out(2)' });
    gsap.from(this.stageArea, { alpha: 0, duration: 0.5, delay: 0.1 });
    gsap.from(this.playButton, { alpha: 0, y: this.playButton.y + 30, duration: 0.45, delay: 0.2, ease: 'power2.out' });
    gsap.from(this.onlineButton, { alpha: 0, y: this.onlineButton.y + 30, duration: 0.45, delay: 0.28, ease: 'power2.out' });
  }
}
