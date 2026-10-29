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
import { Modal } from '../ui/Modal.ts';
import { Scene, SCENES } from '../ui/Scene.ts';

export interface MenuOptions {
  /** The level shown first: the one played last. */
  selected: Difficulty;
  onPick: (difficulty: Difficulty) => void;
  onOnline: () => void;
}

const soundLabel = () => `Dźwięk: ${feedback.settings.sound ? 'włączony' : 'wyłączony'}`;
const hapticsLabel = () => `Wibracje: ${feedback.settings.haptics ? 'włączone' : 'wyłączone'}`;

/** One level on the stage: its scene with its dragon hovering over it. */
interface Stage {
  root: Container;
  scene: Scene;
  dragon: DragonView;
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
  /** Which of the three levels is shown. */
  private readonly dots = new Graphics();
  private readonly playButton: Button;
  private readonly onlineButton: Button;
  private readonly settingsButton: Button;
  private modal: Modal | null = null;
  private readonly onPick: (difficulty: Difficulty) => void;
  private index: number;
  private stageWidth = 0;
  private stageHeight = 0;
  private screenWidth = 0;
  private screenHeight = 0;
  private entered = false;
  private swipeFrom: number | null = null;

  constructor(options: MenuOptions) {
    super();
    this.onPick = options.onPick;
    this.index = DIFFICULTIES.indexOf(options.selected);
    for (const text of [this.titleTop, this.titleBottom, this.levelName, this.levelInfo]) text.anchor.set(0.5, 0);

    this.prevButton = new Button({ text: 'Poprzedni', icon: 'back', onTap: () => this.flip(-1) });
    this.nextButton = new Button({ text: 'Następny', icon: 'back', onTap: () => this.flip(1) });
    this.playButton = new Button({ text: 'Walcz!', variant: 'primary', onTap: () => this.onPick(this.difficulty) });
    this.onlineButton = new Button({
      text: 'Pojedynek online',
      subtitle: 'gracz kontra gracz',
      variant: 'accent',
      onTap: options.onOnline,
    });
    this.settingsButton = new Button({ text: 'Ustawienia', icon: 'gear', onTap: () => this.openSettings() });

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
      this.dots,
      this.levelName,
      this.levelInfo,
      this.playButton,
      this.onlineButton,
      this.settingsButton,
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
    const infoY = playY - 18 - 22;
    const nameY = infoY - 34;
    this.levelInfo.position.set(width / 2, infoY);
    this.levelName.position.set(width / 2, nameY);
    const dotsY = nameY - 14;

    const stageTop = this.titleBottom.y + this.titleBottom.height + 14;
    this.stageWidth = column;
    this.stageHeight = Math.max(150, Math.min(400, dotsY - 14 - stageTop));
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
    this.drawDots(width / 2, dotsY);

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
    if (index >= 0) this.onPick(DIFFICULTIES[index]);
    else if (event.key === 'ArrowLeft') this.flip(-1);
    else if (event.key === 'ArrowRight') this.flip(1);
    else if (event.key === 'Enter') this.onPick(this.difficulty);
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
    const stage: Stage = { root, scene: new Scene(SCENES[enemy.id] ?? SCENES.dragon), dragon: new DragonView(designOf(enemy)) };
    root.addChild(stage.scene, stage.dragon);
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
    this.levelInfo.text = `${enemy.name} · ${CLUES[this.difficulty]} podpowiedzi`;
    if (from !== 0) gsap.fromTo(this.levelName.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    if (this.screenWidth > 0) this.drawDots(this.screenWidth / 2, this.levelName.y - 14);
  }

  private layoutStage(stage: Stage): void {
    stage.scene.layout(this.stageWidth, this.stageHeight, 24);
    const ground = stage.scene.groundY() + 4;
    stage.dragon.layout(Math.max(48, Math.min(this.stageWidth * 0.8, (ground - 12) * 1.05)));
    stage.dragon.position.set(this.stageWidth / 2 + this.stageWidth * 0.03, ground - stage.dragon.footOffset());
  }

  private drawDots(x: number, y: number): void {
    const spacing = 18;
    this.dots.clear();
    DIFFICULTIES.forEach((_, i) => {
      const at = x + (i - 1) * spacing;
      if (i === this.index) {
        this.dots.circle(at, y, 5.5).fill(theme.gold);
      } else {
        this.dots.circle(at, y, 4).fill({ color: theme.textMuted, alpha: 0.5 });
      }
    });
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
