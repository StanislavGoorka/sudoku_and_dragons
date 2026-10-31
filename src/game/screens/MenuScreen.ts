import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { CLUES, REGIONS, STAGES, type Stage } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { loadStageId, saveStageId } from '../difficulty.ts';
import { lookOf } from '../enemies.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';
import { DragonView } from '../ui/DragonView.ts';
import { currentStreak, dailyReward, dayKey } from '../progress/daily.ts';
import { canBuyNew, currentStage, isStageUnlocked, stageRecord } from '../progress/progress.ts';
import { starsWord } from '../progress/rewardText.ts';
import { activeBattle, progress, saveActiveBattle } from '../progress/store.ts';
import { Modal } from '../ui/Modal.ts';
import { MusicControl } from '../ui/MusicControl.ts';
import { Scene } from '../ui/Scene.ts';
import { drawLock } from '../ui/lock.ts';
import { drawStar, StarCounter } from '../ui/stars.ts';

export interface MenuOptions {
  /** A campaign battle. */
  onPick: (stage: Stage) => void;
  /** The campaign map. */
  onMap: () => void;
  onOnline: () => void;
  /** Today's daily challenge. */
  onDaily: () => void;
  /** The star counter opens the progress screen. */
  onProgress: () => void;
  onShop: () => void;
  /** The nickname and the account (log in, register). */
  onAccount: () => void;
  onResume: () => void;
  /** A requested new battle would replace the saved one: ask before discarding it. */
  onNewBattle?: () => void;
}

const soundLabel = () => `Dźwięki: ${feedback.settings.sound ? 'włączone' : 'wyłączone'}`;
const hapticsLabel = () => `Wibracje: ${feedback.settings.haptics ? 'włączone' : 'wyłączone'}`;

/** One campaign stage on show: its region's scene with its dragon hovering over it (a dark shape behind a lock until open). */
interface Shown {
  root: Container;
  scene: Scene;
  dragon: DragonView;
  lock: Graphics | null;
}

/**
 * Start screen, kept to a few things: the logo, one level at a time (its dragon in its scene,
 * flipped with the arrows or a swipe), a big "Walcz!" button, the daily challenge and online duels
 * side by side, and round buttons for the account, the shop and the settings.
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
  private stage: Shown | null = null;
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
  /** The daily challenge, with a gold dot until today's is won. */
  private readonly dailyButton: Button;
  private readonly dailyDot = new Graphics();
  private readonly settingsButton: Button;
  private readonly accountButton: Button;
  /** The campaign map, beside the star counter. */
  private readonly mapButton: Button;
  /** Opens the shop (board themes, dragon skins); a gold dot on it when the stars buy something not owned yet. */
  private readonly shopButton: Button;
  private readonly shopDot = new Graphics();
  private modal: Modal | null = null;
  private readonly onPick: (stage: Stage) => void;
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
    // The stage played last, if it is open; otherwise the one to play next.
    const last = STAGES.find((stage) => stage.id === loadStageId());
    this.index = STAGES.indexOf(last && isStageUnlocked(progress, last) ? last : currentStage(progress));
    this.starCounter = new StarCounter(progress.stars, options.onProgress);
    for (const text of [this.titleTop, this.titleBottom, this.levelName, this.levelInfo]) text.anchor.set(0.5, 0);

    this.prevButton = new Button({ text: 'Poprzedni', icon: 'back', onTap: () => this.flip(-1) });
    this.nextButton = new Button({ text: 'Następny', icon: 'back', onTap: () => this.flip(1) });
    this.playButton = new Button({ text: 'Walcz!', variant: 'primary', onTap: () => this.play(this.current) });
    this.onlineButton = new Button({
      text: 'Pojedynek',
      subtitle: 'online z graczem',
      variant: 'accent',
      onTap: options.onOnline,
    });
    const today = dayKey(new Date());
    const doneToday = progress.daily.lastWon === today;
    const reward = dailyReward(progress.daily, today);
    this.dailyButton = new Button({
      text: 'Wyzwanie dnia',
      subtitle: doneToday ? `zrobione · seria ${currentStreak(progress.daily, today)}` : `nagroda: ${reward} ${starsWord(reward)}`,
      variant: 'secondary',
      onTap: options.onDaily,
    });
    this.dailyDot.visible = !doneToday;
    this.dailyDot.eventMode = 'none';
    this.dailyButton.addChild(this.dailyDot);
    this.settingsButton = new Button({ text: 'Ustawienia', icon: 'gear', onTap: () => this.openSettings() });
    this.shopButton = new Button({ text: 'Sklep', icon: 'palette', onTap: options.onShop });
    this.accountButton = new Button({ text: 'Konto', icon: 'user', onTap: options.onAccount });
    this.mapButton = new Button({ text: 'Mapa', icon: 'map', onTap: options.onMap });
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
      this.dailyButton,
      this.settingsButton,
      this.shopButton,
      this.accountButton,
      this.mapButton,
      this.starCounter,
    );
    this.showLevel(0);
    const saved = activeBattle();
    if (saved) {
      const name = saved.daily ? `Wyzwanie dnia · ${saved.daily}` : saved.battle.enemy.name;
      this.modal = new Modal(options.onNewBattle ? 'Rozpocząć nową walkę?' : 'Wrócić do walki?',
        `Zapisana walka: ${name}.\nPlansza, notatki i HP czekają na Ciebie.`, [
          { text: 'Wznów walkę', variant: 'primary', onTap: options.onResume },
          ...(options.onNewBattle ? [{ text: 'Rozpocznij nową', onTap: () => {
            saveActiveBattle(null);
            options.onNewBattle!();
          } }] : []),
          { text: 'Zostań w menu', onTap: () => this.closeModal() },
        ]);
      this.addChild(this.modal);
    }
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    killTweens(this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton, this.dailyButton);
    for (const item of [this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton, this.dailyButton]) item.alpha = 1;

    const margin = 16;
    const gap = 12;
    const column = Math.min(width - margin * 2, 420);
    const left = (width - column) / 2;

    this.settingsButton.position.set(width - margin - 44, 12);
    this.settingsButton.layout(44, 44);
    this.shopButton.position.set(width - margin - 44 - 10 - 44, 12);
    this.shopButton.layout(44, 44);
    this.accountButton.position.set(width - margin - (44 + 10) * 2 - 44, 12);
    this.accountButton.layout(44, 44);
    this.starCounter.layout(42);
    this.starCounter.position.set(margin, 13);
    this.mapButton.position.set(margin + this.starCounter.pillWidth + 10, 12);
    this.mapButton.layout(44, 44);

    // The logo sits between the left and right buttons when it fits there, else under them.
    const besideRow = Math.min(width / 2 - (this.mapButton.x + 44), this.accountButton.x - width / 2) - 8;
    const titleTop = this.titleTop.width / 2 <= besideRow ? Math.max(18, height * 0.035) : 12 + 44 + 4;
    this.titleTop.position.set(width / 2, titleTop);
    this.titleBottom.position.set(width / 2, titleTop + this.titleTop.height * 0.78);

    // From the bottom up: the daily challenge and online side by side, play, level texts, dots; the stage takes what is left.
    const onlineHeight = 62;
    const playHeight = 70;
    const onlineY = height - margin - onlineHeight;
    const playY = onlineY - gap - playHeight;
    const half = (column - gap) / 2;
    this.dailyButton.position.set(left, onlineY);
    this.dailyButton.layout(half, onlineHeight);
    this.onlineButton.position.set(left + half + gap, onlineY);
    this.onlineButton.layout(half, onlineHeight);
    this.dailyDot.clear().circle(half - 8, 4, 7).fill(theme.gold).stroke({ width: 2.5, color: theme.panelLip });
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
    if (index >= 0) this.play(REGIONS[index].stages[0]);
    else if (event.key === 'ArrowLeft') this.flip(-1);
    else if (event.key === 'ArrowRight') this.flip(1);
    else if (event.key === 'Enter') this.play(this.current);
  }

  /** Back closes the settings; otherwise there is nothing to go back to (the app exits). */
  handleBack(): boolean {
    if (!this.modal) return false;
    this.closeModal();
    return true;
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.titleTop, this.titleBottom, this.stageArea, this.playButton, this.onlineButton, this.dailyButton, this.levelName.scale);
    if (this.stage) killTweens(this.stage.root);
    super.destroy(options);
  }

  private get current(): Stage {
    return STAGES[this.index];
  }

  /** Starts a battle, if that stage is open. */
  private play(stage: Stage): void {
    if (isStageUnlocked(progress, stage)) this.onPick(stage);
  }

  /** The open stages, and the next one (shown locked): no further, so the campaign keeps a surprise. */
  private flip(step: number): void {
    if (this.modal) return;
    const last = Math.min(STAGES.length - 1, STAGES.indexOf(currentStage(progress)) + 1);
    const next = Math.max(0, Math.min(last, this.index + step));
    if (next === this.index) return;
    this.index = next;
    if (isStageUnlocked(progress, this.current)) saveStageId(this.current.id);
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
    const shown = this.current;
    const look = lookOf(shown.enemy, shown);
    const old = this.stage;
    const root = new Container();
    const open = isStageUnlocked(progress, shown);
    const stage: Shown = {
      root,
      scene: new Scene(look.scene),
      dragon: new DragonView(look.design),
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

    const { region } = shown;
    this.levelName.text = shown.enemy.name;
    const place = shown.boss ? 'boss' : `walka ${shown.number} z ${region.stages.length}`;
    this.levelInfo.text = open
      ? `${region.name} · ${place} · ${CLUES[region.difficulty]} podpowiedzi`
      : `Pokonaj najpierw: ${STAGES[this.index - 1].enemy.name}`;
    this.playButton.setText(open ? 'Walcz!' : 'Zablokowany');
    this.playButton.setEnabled(open);
    if (from !== 0) gsap.fromTo(this.levelName.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    this.drawBestStars();
  }

  private layoutStage(stage: Shown): void {
    stage.scene.layout(this.stageWidth, this.stageHeight, 24);
    const ground = stage.scene.groundY() + 4;
    stage.dragon.layout(Math.max(48, Math.min(this.stageWidth * 0.8, (ground - 12) * 1.05)));
    stage.dragon.position.set(this.stageWidth / 2 + this.stageWidth * 0.03, ground - stage.dragon.footOffset());
    if (stage.lock) drawLock(stage.lock.clear(), this.stageWidth / 2, this.stageHeight * 0.45, Math.min(90, this.stageHeight * 0.3));
  }

  /** Three small stars under the level name: the most it has given (none shown while locked). */
  private drawBestStars(): void {
    this.bestStars.clear();
    if (this.screenWidth === 0 || !isStageUnlocked(progress, this.current)) return;
    const best = stageRecord(progress, this.current).bestStars;
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
    ], theme.text, new MusicControl());
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
    gsap.from(this.dailyButton, { alpha: 0, y: this.dailyButton.y + 30, duration: 0.45, delay: 0.28, ease: 'power2.out' });
    gsap.from(this.onlineButton, { alpha: 0, y: this.onlineButton.y + 30, duration: 0.45, delay: 0.32, ease: 'power2.out' });
  }
}
