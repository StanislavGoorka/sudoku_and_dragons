import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import {
  applyMove,
  createBattle,
  ENEMIES,
  PLAYER_MAX_HP,
  battleKnockback, attackInterval, bossHint,
  type Battle,
  type Difficulty,
  type Grid,
  type Hit,
  type Puzzle,
  type Stage,
  type Unit,
  type DailyMove,
} from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import type { TrackId } from '../audio/tracks.ts';
import { lookOf } from '../enemies.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import { fireShot } from '../fx/hitEffects.ts';
import { OVERSCAN } from '../safeArea.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { BattleArena } from '../ui/BattleArena.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { Modal, type ModalAction } from '../ui/Modal.ts';
import { MusicControl } from '../ui/MusicControl.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { StarRow } from '../ui/stars.ts';
import { chosenEffect, chosenSkin, chosenTheme, recordBattle, type Reward } from '../progress/progress.ts';
import { rewardLines } from '../progress/rewardText.ts';
import { progress, saveActiveBattle, saveProgress } from '../progress/store.ts';
import type { SavedBattle } from '../progress/battleSave.ts';
import { easyCell, lessonSeen, markLessonSeen } from '../tutorial.ts';
import { BattleTutorial } from './BattleTutorial.ts';
import { fightLayout } from './fightLayout.ts';
import { queueDailyResult, flushDailyResults, type RankedRun } from '../net/daily.ts';
import { saveTrainingSolo } from '../training/store.ts';
import { replayId, ReplayRecorder, replayState, type Replay } from '../history/replay.ts';
import { addReplay } from '../history/store.ts';
import { canUseSkill, createHero, FOCUS_COST, HERO_CLASSES, heroMove, heroTime, useSkill, type HeroState } from '../combat/hero.ts';
import { chosenHero } from '../combat/heroChoice.ts';
import { questExperience, storyHpBonus } from '../progress/character.ts';

export interface GameScreenOptions {
  /** Device-local, unranked solo. The enemy never charges timed attacks. */
  practice?:boolean;
  /** A new battle on the same difficulty. */
  onRestart: () => void;
  /** A battle on another campaign stage (the one this win opened). */
  onPlay: (stage: Stage) => void;
  /** The campaign stage this battle is, if any (the daily challenge is none). */
  stage?: Stage;
  onMenu: () => void;
  /** The day ('YYYY-MM-DD') when this battle is that day's daily challenge. */
  daily?: string;
  resume?: SavedBattle;
  ranked?: RankedRun;
  onRanking?: () => void;
  onReplay: (replay: Replay) => void;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export class GameScreen extends Container {
  readonly music: TrackId = 'battle';
  private readonly puzzle: Puzzle;
  private readonly battle: Battle;
  private readonly hero?: HeroState;
  private readonly skillButton?: Button;
  private skillDisplay = '';
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
  /** Round button in the other corner: notes mode on (gold) or off. */
  private readonly notesButton: Button;
  private notesMode = false;
  /** The leave-battle question or the end-of-battle summary. While it is open the battle is paused. */
  private modal: Modal | null = null;

  private mistakes = 0;
  /** Most units completed with one digit in this battle (for achievements). */
  private bestCombo = 0;
  /** Seconds of battle so far, not counting pauses. */
  private elapsed = 0;
  private endShown = false;
  private reward: Reward | null = null;
  private resultRecorded=false;
  private questXp = 0;
  private readonly replay: ReplayRecorder;
  private finishedReplay: Replay | null = null;
  private readonly ranked: RankedRun | undefined;
  private readonly rankedMoves: DailyMove[];
  private readonly bossLabel = new Text({ text: '', style: { fontFamily: theme.fontFamily,
    fontWeight: '500', fontSize: 13, fill: theme.text, stroke: { color: theme.panel, width: 2 }, align: 'center' } });
  private sinceCheckpoint = 0;
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
    const saved = options.resume;
    if(options.practice&&(options.stage||options.daily||options.ranked||saved?.stage||saved?.daily||saved?.ranked))throw new Error('Practice cannot be ranked');
    this.ranked = saved?.ranked?.run ?? options.ranked;
    this.rankedMoves = saved?.ranked?.moves ?? [];
    const maxHp = PLAYER_MAX_HP + (options.stage ? storyHpBonus(questExperience(progress)) : 0);
    this.battle = saved ? structuredClone(saved.battle) : createBattle(options.stage?.enemy ?? ENEMIES[puzzle.difficulty], maxHp);
    if (!options.daily && !saved?.daily && !this.ranked) {
      this.hero = saved ? (saved.hero && { ...saved.hero }) : createHero(progress.character?.classId ?? chosenHero());
    }
    this.grid = [...(saved?.grid ?? puzzle.givens)];
    this.elapsed = saved?.elapsed ?? 0;
    this.mistakes = saved?.mistakes ?? 0;
    this.bestCombo = saved?.bestCombo ?? 0;
    this.options = options;
    this.replay = new ReplayRecorder({ id: replayId(), difficulty: puzzle.difficulty, title: this.battle.enemy.name,
      mode: options.practice ? 'practice' : options.daily ? 'daily' : options.stage ? 'campaign' : 'solo' },
      this.replayState(), Math.round(this.elapsed * 1000), Boolean(saved), saved?.replay);
    this.pauseButton = new Button({ text: 'Pauza', icon: 'pause', onTap: () => this.requestLeave() });
    this.notesButton = new Button({ text: 'Notatki', icon: 'pencil', onTap: () => this.toggleNotes() });
    this.arena = new BattleArena(this.battle.enemy, lookOf(this.battle.enemy, options.stage), this.battle.playerMaxHp, chosenSkin(progress).design);
    if (this.hero) this.arena.playerHp.setName(HERO_CLASSES[this.hero.id].name);
    const colors = chosenTheme(progress).colors;
    this.board = new BoardView(puzzle.givens, colors);
    this.board.sync(this.grid);
    if (saved) {
      this.board.restoreNotes(saved.notes);
      if (saved.selected !== null) this.board.select(saved.selected);
      this.notesMode = saved.notesMode;
      this.notesButton.setVariant(this.notesMode ? 'primary' : 'secondary');
    }
    this.pad = new NumberPad((digit) => this.handleDigit(digit), colors);
    this.pad.setNotesMode(this.notesMode);
    this.arena.playerHp.setHp(this.battle.playerHp);
    this.arena.enemyHp.setHp(this.battle.enemyHp);
    for (let digit = 1; digit <= 9; digit++) {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
    }
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;

    this.addChild(this.arena, this.pauseButton, this.notesButton, this.board, this.pad, this.hurtFlash, this.fx);
    if (this.hero) {
      this.skillButton = new Button({ text: '', onTap: () => this.castSkill() });
      this.addChild(this.skillButton);
    }
    this.bossLabel.anchor.set(0.5, 0); this.bossLabel.eventMode = 'none';
    this.bossLabel.text = bossHint(this.battle); this.addChild(this.bossLabel);

    // A player's very first battle walks them through it.
    const fought = Object.values(progress.levels).some((level) => level.wins + level.losses > 0);
    if (!options.practice && !fought && !lessonSeen('battle')) {
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
    this.refreshSkill();
    this.checkpoint();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const { arenaY, arenaHeight, boardY, boardSize, padY, padHeight, left, columnWidth } = fightLayout(width, height);
    const buttonSize = 48;
    this.pauseButton.position.set(left + 7, arenaY + 5);
    this.pauseButton.layout(buttonSize, buttonSize);
    this.notesButton.position.set(left + columnWidth - 7 - buttonSize, arenaY + 5);
    this.notesButton.layout(buttonSize, buttonSize);

    this.arena.position.set(left, arenaY);
    const skillWidth = this.skillButton ? Math.min(150, Math.floor(columnWidth * .43)) : 0;
    this.arena.layout(columnWidth, arenaHeight, buttonSize + 4, buttonSize + 4, skillWidth);
    // The visible face sits beside the HP bar; Button keeps a 48 px touch area.
    this.skillButton?.position.set(left + columnWidth - skillWidth - 10, arenaY + arenaHeight - 50);
    this.skillButton?.layout(skillWidth, 40);
    this.bossLabel.position.set(width / 2, arenaY + 41);
    this.bossLabel.style.fontSize = Math.min(13, columnWidth / 25);
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
    if (this.battle.outcome === 'ongoing') this.elapsed += dt;
    const hit = this.options.practice ? null : heroTime(this.battle, dt, this.hero);
    const ongoing = this.battle.outcome === 'ongoing';
    const attackEvery = attackInterval(this.battle);
    this.bossLabel.text = this.options.practice ? 'Trening · bez zegara · bez nagród' : this.battle.outcome === 'ongoing' ? bossHint(this.battle) : '';
    const secondsLeft = attackEvery - this.battle.charge;

    this.arena.charge.visible = ongoing && !this.options.practice;
    this.arena.charge.update(this.battle.charge / attackEvery, secondsLeft, dt);
    this.arena.dragon.setHeat(ongoing && !this.options.practice ? Math.max(0, 1 - secondsLeft / 5) : 0);
    this.tickCountdown(ongoing && !this.options.practice ? secondsLeft : Infinity);
    if (hit) {
      this.replay.record({ kind: 'timer', damage: hit.damage }, this.replayState(), this.elapsed * 1000);
      this.play(hit, this.playDragonAttack(hit));
      this.refreshSkill();
      this.checkpoint();
    }
    if (this.hero?.id === 'ranger' && this.hero.guarded && this.hero.focus === FOCUS_COST) this.refreshSkill();
    this.sinceCheckpoint += deltaMs;
    if (this.sinceCheckpoint >= 1000) this.checkpoint();
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
    this.checkpoint();
    if (this.modal || this.battle.outcome !== 'ongoing') return;
    this.openModal(new Modal('Pauza', this.options.practice ? 'Trening jest zapisany osobno.\nWrócisz do niego z ekranu Trening i lekcje.' : 'Smok czeka na Twój ruch.\nMożesz wrócić do tej walki z menu.', [
      { text: 'Wróć do walki', variant: 'primary', onTap: () => this.closeModal() },
      { text: 'Wyjdź do menu', onTap: () => this.options.onMenu() },
    ], theme.text, new MusicControl()));
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.handleBack();
      return;
    }
    if (this.modal) return;
    if (event.code === 'Space' && this.hero) {
      event.preventDefault();
      this.castSkill();
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      this.handleDigit(Number(event.key));
      return;
    }
    if (event.key === 'n') {
      this.toggleNotes();
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

/** Notes mode: digits become the player's notes in the selected cell instead of moves. */
  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    this.notesButton.setVariant(this.notesMode ? 'primary' : 'secondary');
    this.pad.setNotesMode(this.notesMode);
    feedback.select();
    this.checkpoint();
  }

  private checkpoint(): void {
    if (this.battle.outcome !== 'ongoing') return;
    this.sinceCheckpoint = 0;
    const save=this.options.practice?saveTrainingSolo:saveActiveBattle;
    save({
      version: 1, puzzle: this.puzzle, stage: this.options.stage?.id, daily: this.options.daily,
      grid: [...this.grid], battle: structuredClone(this.battle), notes: this.board.saveNotes(),
      notesMode: this.notesMode, selected: this.board.selected, mistakes: this.mistakes,
      bestCombo: this.bestCombo, elapsed: this.elapsed, replay: this.replay.draft, hero: this.hero && { ...this.hero },
      ranked: this.ranked ? { run: this.ranked, moves: [...this.rankedMoves] } : undefined,
    });
  }

  /** The guided battle is over (finished or skipped): it does not come back, and the dragon's timer starts. */
  private endTutorial(): void {
    markLessonSeen('battle');
    this.tutorial?.destroy({ children: true });
    this.tutorial = null;
    this.refreshSkill();
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
    if (this.notesMode) {
      if (this.board.toggleNote(cell, digit)) feedback.select();
      this.checkpoint();
      return;
    }
    const result = applyMove(this.grid, this.puzzle.solution, cell, digit);
    if (result.kind === 'occupied') return;
    if (this.ranked) this.rankedMoves.push({ cell, digit, at: Math.round(this.elapsed * 1000) });
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

    const hpBefore = this.battle.playerHp;
    const hit = heroMove(this.battle, result, this.hero);
    if (!hit) return;
    const healed = Math.max(0, this.battle.playerHp - hpBefore);
    this.replay.record(result.kind === 'correct'
      ? { kind: 'correct', actor: 0, cell, digit, damage: hit.damage, units: result.completed, finisher: hit.finisher || undefined, healed: healed || undefined }
      : { kind: 'wrong', actor: 0, cell, digit, damage: hit.damage }, this.replayState(), this.elapsed * 1000);
    if (result.kind === 'correct') {
      if (healed) this.showSkillFeedback(`+${healed} HP`, HERO_CLASSES.alchemist.color);
      this.bestCombo = Math.max(this.bestCombo, hit.units);
      this.play(hit, this.playPlayerAttack(hit, cell, result.completed));
      if (!this.options.practice && hit.units > 0 && this.battle.outcome === 'ongoing') {
        const at = this.fx.toLocal(this.arena.chargePoint(), this.arena);
        floatText(this.fx, `+${battleKnockback(this.battle, hit.units) + (this.hero?.id === 'ranger' ? 1 : 0)} s`, { x: at.x + 12, y: at.y - 30 }, {
          color: this.board.colors.placed,
          fontSize: 16,
        });
      }
    } else {
      this.play(hit, this.playDragonAttack(hit));
    }
    this.refreshSkill();
    this.checkpoint();
  }

  private refreshSkill(): void {
    if (!this.hero || !this.skillButton) return;
    const { id, guarded, focus } = this.hero;
    const ready = !this.tutorial && canUseSkill(this.battle, this.hero);
    const label = id === 'alchemist' && focus === FOCUS_COST && this.battle.playerHp === this.battle.playerMaxHp
      ? 'pełne HP' : `${focus}/${FOCUS_COST}${guarded ? ' · osłona' : ''}`;
    const display = `${ready}:${label}`;
    if (display === this.skillDisplay) return;
    this.skillDisplay = display;
    this.skillButton.setText(`${HERO_CLASSES[id].skill} · ${label}`);
    this.skillButton.setVariant(ready ? 'primary' : 'secondary');
    this.skillButton.setEnabled(ready);
    if (!ready) this.skillButton.alpha = .88;
  }

  private castSkill(): void {
    if (!this.hero || this.modal || this.tutorial) return;
    const skill = useSkill(this.battle, this.hero);
    if (!skill) return;
    const def = HERO_CLASSES[skill.id];
    this.replay.record({ kind: 'skill', ...skill }, this.replayState(), this.elapsed * 1000);
    this.arena.playerWarrior.cast();
    const at = this.fx.toLocal(this.arena.playerTarget(), this.arena);
    burst(this.fx, at, def.color, 14);
    const result = skill.healed ? `+${skill.healed} HP` : skill.delayed >= 1 ? `+${Math.floor(skill.delayed)} s` : def.skill;
    this.showSkillFeedback(result, def.color);
    feedback.select();
    this.refreshSkill();
    this.checkpoint();
  }

  private showSkillFeedback(label: string, color: number): void {
    this.arena.playerHp.setHp(this.battle.playerHp);
    const at = this.fx.toLocal(this.arena.playerTarget(), this.arena);
    floatText(this.fx, label, { x: at.x + 40, y: at.y - 16 }, { color, fontSize: 20 });
  }

  private replayState() {
    return replayState(this.grid, [this.battle.playerHp, this.battle.enemyHp], this.battle.outcome);
  }

  private replayAction(): ModalAction[] {
    const replay = this.finishedReplay;
    return replay ? [{ text: 'Analiza walki', onTap: () => this.options.onReplay(replay) }] : [];
  }

  /** Runs a hit's animation, then ends the battle if that hit brought someone to 0 HP. */
  private play(hit: Hit, animation: Promise<void>): void {
    if (this.battle.outcome !== 'ongoing' && !this.resultRecorded) {
      this.resultRecorded=true;
      if (this.options.practice) {
        saveTrainingSolo(null);
      } else {
        if (this.ranked && this.battle.outcome === 'won') {
          // Persist before removing the active checkpoint. An uncertain upload retries the same run ID.
          queueDailyResult(this.ranked, this.rankedMoves);
          void flushDailyResults().catch(() => {});
        }
        const xpBefore = this.options.stage ? questExperience(progress) : 0;
        this.reward = recordBattle(progress, {
          difficulty: this.puzzle.difficulty, won: this.battle.outcome === 'won', mistakes: this.mistakes,
          hpLeft: this.battle.playerHp, maxHp: this.battle.playerMaxHp, seconds: this.elapsed,
          bestCombo: this.bestCombo, stage: this.options.stage?.id, daily: this.options.daily,
        });
        if (this.options.stage) this.questXp = questExperience(progress) - xpBefore;
        // Progress and removal of the checkpoint share the same localStorage write, before animations.
        saveActiveBattle(null);
        saveProgress();
      }
      const best = this.options.practice ? null : this.options.stage
        ? progress.stages[this.options.stage.id]?.bestTime : progress.levels[this.puzzle.difficulty].bestTime;
      this.finishedReplay = addReplay(this.replay.finish(this.elapsed * 1000, best == null ? null : Math.round(best * 1000)));
    }
    // Only the final hit ends the battle; earlier hits may still be landing.
    void animation.then(() => {
      if (!this.destroyed && hit.hpAfter === 0) return this.showEnd(hit);
    });
  }

  /**
   * The warrior swings as the hit effect flies from the board to the enemy: from the cell, or big and gold
   * from the middle of the 3×3 box the digit closed (double damage).
   */
  private async playPlayerAttack(hit: Hit, cell: number, completed: Unit[]): Promise<void> {
    void this.arena.playerWarrior.attack();
    const big = hit.boxed;
    const box = completed.find((unit) => unit.kind === 'box');
    const origin = box ? this.board.unitCenter(box) : this.board.cellCenter(cell);
    const color = big ? theme.flash : this.board.colors.placed;

    await wait(0.1);
    if (this.destroyed) return;
    const from = this.fx.toLocal(origin, this.board);
    const to = this.fx.toLocal(this.arena.enemyTarget(), this.arena);
    const side = Math.random() < 0.5 ? -1 : 1;
    await fireShot(this.fx, chosenEffect(progress).id, { from, to, big, color, side });
    if (this.destroyed) return;

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
    } else if (big) {
      floatText(this.fx, 'Kwadrat ×2!', { x: to.x, y: to.y - 70 }, { color: theme.combo, fontSize: 26 });
    }
    if (big) shake(this.arena, 4, 0.25);
  }

  /** The enemy lunges and spits a fireball at the warrior. */
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
    this.arena.playerWarrior.hurt(14);
    shake(this, 8, 0.35);
    gsap.fromTo(this.hurtFlash, { alpha: 0.3 }, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    this.arena.playerHp.setHp(this.hero ? this.battle.playerHp : hit.hpAfter);
    floatText(this.fx, hit.damage ? `-${hit.damage}` : 'Blok!', { x: to.x, y: to.y - 30 }, { color: hit.damage ? theme.error : theme.gold, fontSize: 26 });
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

    // The defeated fighter falls before the result opens.
    const won = this.battle.outcome === 'won';
    feedback.dragonFalls();
    if (won) this.arena.playerWarrior.celebrate();
    await (won ? this.arena.dragon : this.arena.playerWarrior).die();
    if (this.destroyed) return;

    const { name, attack } = this.battle.enemy;
    const stats = `Czas: ${formatTime(this.elapsed)} · Błędy: ${this.mistakes}`;
    if(this.options.practice){
      won?feedback.victory():feedback.defeat();
      this.openModal(new Modal(won?'Trening ukończony':'Koniec treningu',
        `${stats}\nTrening nie daje gwiazdek, rekordów ani postępu kampanii.`,[
          {text:'Nowy trening',variant:'primary',onTap:this.options.onRestart},
          {text:'Trening i lekcje',onTap:this.options.onMenu},
          ...this.replayAction(),
        ],won?theme.gold:theme.text));
      return;
    }
    const hint =
      finalHit.cause === 'mistake'
        ? `Każdy błąd to cios smoka za ${attack} HP.`
        : 'Szybkie cyfry i ukończone linie odpychają atak smoka.';
    const reward = this.reward!;
    if (won) {
      feedback.victory();
    } else {
      feedback.defeat();
    }

    // A win that opened the next dragon (or region) leads straight to it.
    const { unlocked } = reward;
    const actions: ModalAction[] = unlocked
      ? [
          {
            text: unlocked.number === 1 ? `Dalej: ${unlocked.region.name}` : `Dalej: ${unlocked.enemy.name}`,
            variant: 'primary',
            onTap: () => this.options.onPlay(unlocked),
          },
          { text: 'Walcz ponownie', onTap: () => this.options.onRestart() },
        ]
      : [{ text: 'Walcz ponownie', variant: 'primary', onTap: () => this.options.onRestart() }];
    actions.push(...this.replayAction(), { text: 'Menu', onTap: () => this.options.onMenu() });
    if (this.ranked && this.options.onRanking) actions.unshift({ text: 'Ranking dnia', onTap: this.options.onRanking });
    const lines = [...(won ? [] : [hint]), stats, ...(this.questXp ? [`Quest ukończony · +${this.questXp} XP`] : []), ...rewardLines(reward, progress.stars)];
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
