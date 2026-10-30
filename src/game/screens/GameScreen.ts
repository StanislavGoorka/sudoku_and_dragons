import gsap from 'gsap';
import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import {
  advanceTime,
  applyMove,
  createBattle,
  ENEMIES,
  moveKnockback,
  resolveMove,
  type Battle,
  type Difficulty,
  type Grid,
  type Hit,
  type Puzzle,
  type Unit,
} from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import { fireShot } from '../fx/hitEffects.ts';
import { OVERSCAN } from '../safeArea.ts';
import { theme } from '../theme.ts';
import { BattleArena } from '../ui/BattleArena.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { Modal, type ModalAction } from '../ui/Modal.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { StarRow } from '../ui/stars.ts';
import { chosenEffect, chosenSkin, chosenTheme, recordBattle } from '../progress/progress.ts';
import { rewardLines } from '../progress/rewardText.ts';
import { progress, saveProgress } from '../progress/store.ts';
import { easyCell, lessonSeen, markLessonSeen } from '../tutorial.ts';
import { BattleTutorial } from './BattleTutorial.ts';
import { fightLayout } from './fightLayout.ts';

export interface GameScreenOptions {
  /** A new battle on the same difficulty. */
  onRestart: () => void;
  /** A battle on another level (the one this win unlocked). */
  onPlay: (difficulty: Difficulty) => void;
  onMenu: () => void;
  /** The day ('YYYY-MM-DD') when this battle is that day's daily challenge. */
  daily?: string;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export class GameScreen extends Container {
  private readonly puzzle: Puzzle;
  private readonly battle: Battle;
  /** The board as the rules see it; moves are checked here against the solution. */
  private readonly grid: Grid;
  private readonly options: GameScreenOptions;

  private readonly arena: BattleArena;
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  /** Projectiles, particles and damage numbers, above everything else. */
  private readonly fx = new Container();
  /** Red full-screen flash when the player is hit. */
  private readonly hurtFlash = new Graphics();
  /** Round button in the scene's corner: pauses, and leads back to the menu. */
  private readonly pauseButton: Button;
  /** The leave-battle question or the end-of-battle summary. While it is open the battle is paused. */
  private modal: Modal | null = null;

  private mistakes = 0;
  /** Most units completed with one digit in this battle (for achievements). */
  private bestCombo = 0;
  /** Seconds of battle so far, not counting pauses. */
  private elapsed = 0;
  private endShown = false;
  /** A daily battle announces itself once, at the first layout. */
  private announced = false;
  /** Whole seconds left at the last countdown tick sound, or null outside the last seconds. */
  private lastTick: number | null = null;
  /** The guided first battle, while it lasts; the dragon's timer waits for it. */
  private tutorial: BattleTutorial | null = null;
  /** The selected cell as last seen, so the tutorial hears about a new selection. */
  private lastSelected: number | null = null;
  /** Arena, board and pad rectangles from the last layout, for the tutorial to point at. */
  private areas = { arena: new Rectangle(), board: new Rectangle(), pad: new Rectangle() };
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(puzzle: Puzzle, options: GameScreenOptions) {
    super();
    this.puzzle = puzzle;
    this.battle = createBattle(ENEMIES[puzzle.difficulty]);
    this.grid = [...puzzle.givens];
    this.options = options;
    this.pauseButton = new Button({ text: 'Pauza', icon: 'pause', onTap: () => this.requestLeave() });
    this.arena = new BattleArena(this.battle.enemy, this.battle.playerMaxHp, chosenSkin(progress).design);
    const colors = chosenTheme(progress).colors;
    this.board = new BoardView(puzzle.givens, colors);
    this.pad = new NumberPad((digit) => this.handleDigit(digit), colors);
    for (let digit = 1; digit <= 9; digit++) {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
    }
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;

    this.addChild(this.arena, this.pauseButton, this.board, this.pad, this.hurtFlash, this.fx);

    // A player's very first battle walks them through it.
    const fought = Object.values(progress.levels).some((level) => level.wins + level.losses > 0);
    if (!fought && !lessonSeen('battle')) {
      this.tutorial = new BattleTutorial(
        {
          arena: () => this.areas.arena,
          pad: () => this.areas.pad,
          board: () => this.areas.board,
          cell: (cell) => {
            const at = this.toLocal(this.board.cellCenter(cell), this.board);
            const size = this.areas.board.width / 9;
            return new Rectangle(at.x - size / 2, at.y - size / 2, size, size);
          },
          charge: () => {
            const at = this.toLocal(this.arena.chargePoint(), this.arena);
            return new Rectangle(at.x - 34, at.y - 34, 68, 88);
          },
        },
        easyCell(this.grid),
        () => this.endTutorial(),
      );
      this.addChild(this.tutorial);
    }
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const { arenaY, arenaHeight, boardY, boardSize, padY, padHeight, left, columnWidth } = fightLayout(width, height);
    const buttonSize = 36;
    this.pauseButton.position.set(left + 7, arenaY + 5);
    this.pauseButton.layout(buttonSize, buttonSize);

    this.arena.position.set(left, arenaY);
    this.arena.layout(columnWidth, arenaHeight, buttonSize + 4);
    this.board.position.set((width - boardSize) / 2, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(columnWidth, padHeight);
    this.areas = {
      arena: new Rectangle(left, arenaY, columnWidth, arenaHeight),
      board: new Rectangle(this.board.x, this.board.y, boardSize, boardSize),
      pad: new Rectangle(left, padY, columnWidth, padHeight),
    };
    this.tutorial?.layout(left, columnWidth, arenaY, boardY);

    // Oversized so the flash also covers the safe-area margins around this screen.
    this.hurtFlash.clear().rect(-OVERSCAN, -OVERSCAN, width + OVERSCAN * 2, height + OVERSCAN * 2).fill(theme.error);
    this.modal?.layout(width, height);
    if (this.options.daily && !this.announced) {
      this.announced = true;
      floatText(this.fx, 'Wyzwanie dnia', this.fx.toLocal(this.board.cellCenter(40), this.board), { color: theme.gold, fontSize: 32 });
    }
  }

  /** Called every frame with the frame time; drives the dragon's timed attack. */
  update(deltaMs: number): void {
    if (this.tutorial && this.board.selected !== this.lastSelected) {
      this.lastSelected = this.board.selected;
      if (this.lastSelected !== null) this.tutorial.selected(this.grid[this.lastSelected] === 0);
    }
    if (this.modal) return;
    // The tutorial holds the clock: the countdown shows, but neither it nor the battle time runs.
    const dt = this.tutorial ? 0 : deltaMs / 1000;
    const hit = advanceTime(this.battle, dt);
    const ongoing = this.battle.outcome === 'ongoing';
    if (ongoing) this.elapsed += dt;
    const { attackEvery } = this.battle.enemy;
    const secondsLeft = attackEvery - this.battle.charge;

    this.arena.charge.visible = ongoing;
    this.arena.charge.update(this.battle.charge / attackEvery, secondsLeft, dt);
    this.arena.dragon.setHeat(ongoing ? Math.max(0, 1 - secondsLeft / 5) : 0);
    this.tickCountdown(ongoing ? secondsLeft : Infinity);
    if (hit) this.play(hit, this.playDragonAttack(hit));
  }

  /** Android back button and Escape: close an open question, ask to leave, or leave a finished battle. */
  handleBack(): boolean {
    if (this.endShown) {
      this.options.onMenu();
    } else if (this.modal) {
      this.closeModal();
    } else {
      this.requestLeave();
    }
    return true;
  }

  /** The app went to the background: show a pause so the dragon does not strike the moment it returns. */
  pause(): void {
    if (this.modal || this.battle.outcome !== 'ongoing') return;
    this.openModal(new Modal('Pauza', 'Smok czeka na Twój ruch.\nWyjście kończy tę walkę.', [
      { text: 'Wróć do walki', variant: 'primary', onTap: () => this.closeModal() },
      { text: 'Wyjdź do menu', onTap: () => this.options.onMenu() },
    ]));
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.handleBack();
      return;
    }
    if (this.modal) return;
    if (/^[1-9]$/.test(event.key)) {
      this.handleDigit(Number(event.key));
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.board.moveSelection(...move);
    }
  }

  /** Dev helper: fills every empty cell but `leave` with the right digit. */
  debugFill(leave = 1): void {
    const empty = this.grid.flatMap((value, cell) => (value === 0 ? [cell] : []));
    for (const cell of empty.slice(0, Math.max(0, empty.length - leave))) {
      this.board.select(cell);
      this.handleDigit(this.puzzle.solution[cell]);
    }
  }

  /** Dev helper: plays a wrong digit in the first empty cell. */
  debugMistake(): void {
    const cell = this.grid.indexOf(0);
    if (cell < 0) return;
    this.board.select(cell);
    this.handleDigit((this.puzzle.solution[cell] % 9) + 1);
  }

  override destroy(options?: DestroyOptions): void {
    stopEffects(this.fx);
    gsap.killTweensOf(this.hurtFlash);
    super.destroy(options);
  }

  /** The guided battle is over (finished or skipped): it does not come back, and the dragon's timer starts. */
  private endTutorial(): void {
    markLessonSeen('battle');
    this.tutorial?.destroy({ children: true });
    this.tutorial = null;
  }

  /** The pause button and Back pause the battle (leaving is one of the options); after the battle they go to the menu. */
  private requestLeave(): void {
    if (this.modal) return;
    if (this.battle.outcome !== 'ongoing') {
      this.options.onMenu();
      return;
    }
    this.pause();
  }

  private openModal(modal: Modal): void {
    this.closeModal();
    this.modal = modal;
    this.addChild(modal);
    modal.layout(this.screenWidth, this.screenHeight);
    modal.show();
  }

  private closeModal(): void {
    this.modal?.destroy({ children: true });
    this.modal = null;
  }

  private handleDigit(digit: number): void {
    if (this.battle.outcome !== 'ongoing' || this.modal) return;
    if (this.tutorial && !this.tutorial.acceptsDigits) return;
    const cell = this.board.selected;
    if (cell === null) return;
    const result = applyMove(this.grid, this.puzzle.solution, cell, digit);
    if (result.kind === 'occupied') return;
    this.tutorial?.played(result.kind === 'correct');

    if (result.kind === 'wrong') {
      this.board.reject(cell, digit);
      this.mistakes++;
      feedback.mistake();
    } else {
      this.board.reveal(cell, digit, result.completed);
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
      feedback.digit(digit);
      if (result.completed.length > 0) feedback.unitsCompleted(result.completed.length);
    }

    const hit = resolveMove(this.battle, result);
    if (!hit) return;
    if (result.kind === 'correct') {
      this.bestCombo = Math.max(this.bestCombo, hit.units);
      this.play(hit, this.playPlayerAttack(hit, cell, result.completed));
      if (hit.units > 0 && this.battle.outcome === 'ongoing') {
        const at = this.fx.toLocal(this.arena.chargePoint(), this.arena);
        floatText(this.fx, `+${moveKnockback(hit.units)} s`, { x: at.x + 12, y: at.y - 30 }, {
          color: this.board.colors.placed,
          fontSize: 16,
        });
      }
    } else {
      this.play(hit, this.playDragonAttack(hit));
    }
  }

  /** Runs a hit's animation, then ends the battle if that hit brought someone to 0 HP. */
  private play(hit: Hit, animation: Promise<void>): void {
    // Only the final hit ends the battle; earlier hits may still be landing.
    void animation.then(() => {
      if (!this.destroyed && hit.hpAfter === 0) return this.showEnd(hit);
    });
  }

  /** Your dragon lunges as your hit effect flies from the board to the enemy: a small shot per digit, a big one per completed unit. */
  private async playPlayerAttack(hit: Hit, cell: number, completed: Unit[]): Promise<void> {
    void this.arena.playerDragon.attack();
    const big = completed.length > 0;
    const origins = big ? completed.map((unit) => this.board.unitCenter(unit)) : [this.board.cellCenter(cell)];
    const color = big ? theme.flash : this.board.colors.placed;
    let landed = false;

    await Promise.all(
      origins.map(async (origin, i) => {
        await wait(0.1 + i * 0.12);
        if (this.destroyed) return;
        const from = this.fx.toLocal(origin, this.board);
        const to = this.fx.toLocal(this.arena.enemyTarget(), this.arena);
        const side = Math.random() < 0.5 ? -1 : 1;
        await fireShot(this.fx, chosenEffect(progress).id, { from, to, big, color, side });
        if (this.destroyed || landed) return;

        // The first orb to land carries the whole hit.
        landed = true;
        feedback.enemyHit(big);
        this.arena.enemyHp.setHp(hit.hpAfter);
        this.arena.dragon.hurt(big ? 18 : 6);
        const jitter = (Math.random() - 0.5) * 40;
        floatText(this.fx, `-${hit.damage}`, { x: to.x + 45 + jitter, y: to.y - 25 }, {
          color: big ? theme.flash : theme.text,
          fontSize: big ? 30 : 20,
        });
        if (hit.finisher) {
          floatText(this.fx, 'Cios ostateczny!', { x: to.x, y: to.y - 70 }, { color: theme.combo, fontSize: 26 });
        } else if (hit.units >= 2) {
          floatText(this.fx, `COMBO ×${hit.units}!`, { x: to.x, y: to.y - 70 }, { color: theme.combo, fontSize: 26 });
        }
        if (big) shake(this.arena, 4, 0.25);
      }),
    );
  }

  /** The enemy lunges and spits a fireball at your dragon. */
  private async playDragonAttack(hit: Hit): Promise<void> {
    feedback.dragonLunge();
    await this.arena.dragon.attack();
    if (this.destroyed) return;
    feedback.fireball();
    const from = this.fx.toLocal(this.arena.fireOrigin(), this.arena);
    const to = this.fx.toLocal(this.arena.playerTarget(), this.arena);
    await launchOrb(this.fx, from, to, { color: theme.fire, radius: 12, duration: 0.4, arc: 30 });
    if (this.destroyed) return;

    feedback.playerHit();
    burst(this.fx, to, theme.fire, 18);
    this.arena.playerDragon.hurt(14);
    shake(this, 8, 0.35);
    gsap.fromTo(this.hurtFlash, { alpha: 0.3 }, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    this.arena.playerHp.setHp(hit.hpAfter);
    floatText(this.fx, `-${hit.damage}`, { x: to.x, y: to.y - 30 }, { color: theme.error, fontSize: 26 });
  }

  /** A tick for each of the last five seconds before the dragon's timed attack. */
  private tickCountdown(secondsLeft: number): void {
    if (secondsLeft > 5) {
      this.lastTick = null;
      return;
    }
    const whole = Math.ceil(secondsLeft);
    if (whole === this.lastTick) return;
    this.lastTick = whole;
    feedback.countdownTick();
  }

  /** `finalHit` is the hit that brought someone to 0 HP. */
  private async showEnd(finalHit: Hit): Promise<void> {
    if (this.endShown) return;
    this.endShown = true;
    this.closeModal();

    // The loser's dragon falls: the enemy, or yours.
    const won = this.battle.outcome === 'won';
    feedback.dragonFalls();
    await (won ? this.arena.dragon : this.arena.playerDragon).die();
    if (this.destroyed) return;

    const { name, attack } = this.battle.enemy;
    const stats = `Czas: ${formatTime(this.elapsed)} · Błędy: ${this.mistakes}`;
    const hint =
      finalHit.cause === 'mistake'
        ? `Każdy błąd to cios smoka za ${attack} HP.`
        : 'Szybkie cyfry i ukończone linie odpychają atak smoka.';
    const reward = recordBattle(progress, {
      difficulty: this.puzzle.difficulty,
      won,
      mistakes: this.mistakes,
      hpLeft: this.battle.playerHp,
      maxHp: this.battle.playerMaxHp,
      seconds: this.elapsed,
      bestCombo: this.bestCombo,
      daily: this.options.daily,
    });
    saveProgress();
    if (won) {
      feedback.victory();
    } else {
      feedback.defeat();
    }

    // A win that opened the next dragon leads straight to it.
    const { unlocked } = reward;
    const actions: ModalAction[] = unlocked
      ? [
          { text: `Dalej: ${ENEMIES[unlocked].name}`, variant: 'primary', onTap: () => this.options.onPlay(unlocked) },
          { text: 'Walcz ponownie', onTap: () => this.options.onRestart() },
        ]
      : [{ text: 'Walcz ponownie', variant: 'primary', onTap: () => this.options.onRestart() }];
    actions.push({ text: 'Menu', onTap: () => this.options.onMenu() });
    const lines = [...(won ? [] : [hint]), stats, ...rewardLines(reward, progress.stars)];
    const stars = won ? new StarRow(reward.goals) : null;
    this.openModal(
      new Modal(
        won ? `${name} pokonany!` : `${name} cię pokonał…`,
        lines.join('\n'),
        actions,
        won ? theme.gold : theme.text,
        stars ? { view: stars, height: StarRow.HEIGHT, layout: (width) => stars.layout(width) } : undefined,
      ),
    );
    void stars?.play();
  }
}
