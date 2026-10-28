import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import {
  advanceTime,
  createBattle,
  ENEMIES,
  moveKnockback,
  resolveMove,
  type Battle,
  type Hit,
  type Puzzle,
  type Unit,
} from '../../core/index.ts';
import { DIFFICULTY_INFO } from '../difficulty.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import { OVERSCAN } from '../safeArea.ts';
import { theme } from '../theme.ts';
import { BattleArena } from '../ui/BattleArena.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { Modal } from '../ui/Modal.ts';
import { NumberPad } from '../ui/NumberPad.ts';

export interface GameScreenOptions {
  /** A new battle on the same difficulty. */
  onRestart: () => void;
  onMenu: () => void;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export class GameScreen extends Container {
  private readonly puzzle: Puzzle;
  private readonly battle: Battle;
  private readonly options: GameScreenOptions;

  private readonly title = new Text({
    text: 'Sudoku & Dragons',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 20, fill: theme.text },
  });
  private readonly status = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontSize: 14, fill: theme.textMuted },
  });
  private readonly arena: BattleArena;
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  /** Projectiles, particles and damage numbers, above everything else. */
  private readonly fx = new Container();
  /** Red full-screen flash when the player is hit. */
  private readonly hurtFlash = new Graphics();
  private readonly menuButton: Button;
  /** The leave-battle question or the end-of-battle summary. While it is open the battle is paused. */
  private modal: Modal | null = null;

  private mistakes = 0;
  /** Seconds of battle so far, not counting pauses. */
  private elapsed = 0;
  private endShown = false;
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(puzzle: Puzzle, options: GameScreenOptions) {
    super();
    this.puzzle = puzzle;
    this.battle = createBattle(ENEMIES[puzzle.difficulty]);
    this.options = options;
    this.menuButton = new Button({ text: '‹ Menu', onTap: () => this.requestLeave() });

    this.title.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);
    this.arena = new BattleArena(this.battle.enemy, this.battle.playerMaxHp);
    this.board = new BoardView(puzzle);
    this.pad = new NumberPad((digit) => this.handleDigit(digit));
    for (let digit = 1; digit <= 9; digit++) {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
    }
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;

    this.addChild(
      this.arena,
      this.title,
      this.status,
      this.menuButton,
      this.board,
      this.pad,
      this.hurtFlash,
      this.fx,
    );
    this.updateStatus();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const margin = 16;
    const gap = 12;
    const headerHeight = 52;
    const minArenaHeight = 150;

    let boardSize = Math.min(width - margin * 2, 560);
    const padHeight = Math.round(Math.min(72, Math.max(48, (boardSize / 9) * 1.3)));
    const room = height - margin * 2 - headerHeight - minArenaHeight - padHeight - gap * 2;
    boardSize = Math.max(180, Math.min(boardSize, room));

    const left = (width - boardSize) / 2;
    const padY = height - margin - padHeight;
    const boardY = padY - gap - boardSize;
    const arenaY = margin + headerHeight;
    const arenaHeight = Math.max(0, boardY - gap - arenaY);

    this.title.position.set(width / 2, margin);
    this.status.position.set(width / 2, margin + 28);
    this.menuButton.position.set(left, margin + 2);
    this.menuButton.layout(64, 30);

    this.arena.position.set(left, arenaY);
    this.arena.layout(boardSize, arenaHeight);
    this.board.position.set(left, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(boardSize, padHeight);

    // Oversized so the flash also covers the safe-area margins around this screen.
    this.hurtFlash.clear().rect(-OVERSCAN, -OVERSCAN, width + OVERSCAN * 2, height + OVERSCAN * 2).fill(theme.error);
    this.modal?.layout(width, height);
  }

  /** Called every frame with the frame time; drives the dragon's timed attack. */
  update(deltaMs: number): void {
    if (this.modal) return;
    const dt = deltaMs / 1000;
    const hit = advanceTime(this.battle, dt);
    const ongoing = this.battle.outcome === 'ongoing';
    if (ongoing) this.elapsed += dt;
    const { attackEvery } = this.battle.enemy;
    const secondsLeft = attackEvery - this.battle.charge;

    this.arena.charge.visible = ongoing;
    this.arena.charge.update(this.battle.charge / attackEvery, secondsLeft, dt);
    this.arena.dragon.setHeat(ongoing ? Math.max(0, 1 - secondsLeft / 5) : 0);
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
    this.openModal(new Modal('Pauza', 'Smok czeka na Twój ruch.', [
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
    const empty = this.board.board.flatMap((value, cell) => (value === 0 ? [cell] : []));
    for (const cell of empty.slice(0, Math.max(0, empty.length - leave))) {
      this.board.select(cell);
      this.handleDigit(this.puzzle.solution[cell]);
    }
  }

  /** Dev helper: plays a wrong digit in the first empty cell. */
  debugMistake(): void {
    const cell = this.board.board.indexOf(0);
    if (cell < 0) return;
    this.board.select(cell);
    this.handleDigit((this.puzzle.solution[cell] % 9) + 1);
  }

  override destroy(options?: DestroyOptions): void {
    stopEffects(this.fx);
    gsap.killTweensOf(this.hurtFlash);
    super.destroy(options);
  }

  /** Leaving mid-battle asks first (and pauses); after the battle it just goes to the menu. */
  private requestLeave(): void {
    if (this.modal) return;
    if (this.battle.outcome !== 'ongoing') {
      this.options.onMenu();
      return;
    }
    this.openModal(new Modal('Opuścić walkę?', 'Postęp tej walki przepadnie.', [
      { text: 'Zostań', variant: 'primary', onTap: () => this.closeModal() },
      { text: 'Wyjdź do menu', onTap: () => this.options.onMenu() },
    ]));
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
    const cell = this.board.selected;
    const result = this.board.place(digit);
    if (cell === null || !result) return;

    if (result.kind === 'wrong') {
      this.mistakes++;
      this.updateStatus();
    } else if (result.kind === 'correct' && this.board.countOf(digit) === 9) {
      this.pad.setDone(digit, true);
    }

    const hit = resolveMove(this.battle, result);
    if (!hit) return;
    if (result.kind === 'correct') {
      this.play(hit, this.playPlayerAttack(hit, cell, result.completed));
      if (hit.units > 0 && this.battle.outcome === 'ongoing') {
        const at = this.fx.toLocal(this.arena.chargePoint(), this.arena);
        floatText(this.fx, `+${moveKnockback(hit.units)} s`, { x: at.x + 12, y: at.y - 30 }, {
          color: theme.placed,
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

  /** Orbs fly from the board to the dragon: a small one per digit, a big one per completed unit. */
  private async playPlayerAttack(hit: Hit, cell: number, completed: Unit[]): Promise<void> {
    const big = completed.length > 0;
    const origins = big ? completed.map((unit) => this.board.unitCenter(unit)) : [this.board.cellCenter(cell)];
    const color = big ? theme.flash : theme.placed;
    let landed = false;

    await Promise.all(
      origins.map(async (origin, i) => {
        await wait(0.1 + i * 0.12);
        if (this.destroyed) return;
        const from = this.fx.toLocal(origin, this.board);
        const to = this.fx.toLocal(this.arena.enemyTarget(), this.arena);
        const side = Math.random() < 0.5 ? -1 : 1;
        await launchOrb(this.fx, from, to, {
          color,
          radius: big ? 9 : 5,
          duration: big ? 0.5 : 0.35,
          arc: side * (30 + Math.random() * 50),
        });
        if (this.destroyed) return;
        burst(this.fx, to, color, big ? 14 : 6);
        if (landed) return;

        // The first orb to land carries the whole hit.
        landed = true;
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

  /** The dragon lunges and spits a fireball at the player's HP bar. */
  private async playDragonAttack(hit: Hit): Promise<void> {
    await this.arena.dragon.attack();
    if (this.destroyed) return;
    const from = this.fx.toLocal(this.arena.enemyTarget(), this.arena);
    const to = this.fx.toLocal(this.arena.playerTarget(), this.arena);
    await launchOrb(this.fx, from, to, { color: theme.fire, radius: 12, duration: 0.4, arc: 30 });
    if (this.destroyed) return;

    burst(this.fx, to, theme.fire, 18);
    shake(this, 8, 0.35);
    gsap.fromTo(this.hurtFlash, { alpha: 0.3 }, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    this.arena.playerHp.setHp(hit.hpAfter);
    floatText(this.fx, `-${hit.damage}`, { x: to.x, y: to.y - 30 }, { color: theme.error, fontSize: 26 });
  }

  private updateStatus(): void {
    const level = DIFFICULTY_INFO[this.puzzle.difficulty].name.toLowerCase();
    this.status.text = `Poziom: ${level} · Błędy: ${this.mistakes}`;
  }

  /** `finalHit` is the hit that brought someone to 0 HP. */
  private async showEnd(finalHit: Hit): Promise<void> {
    if (this.endShown) return;
    this.endShown = true;
    this.closeModal();

    const won = this.battle.outcome === 'won';
    if (won) {
      await this.arena.dragon.die();
    } else {
      await wait(0.6);
    }
    if (this.destroyed) return;

    const { name, attack } = this.battle.enemy;
    const stats = `Czas: ${formatTime(this.elapsed)} · Błędy: ${this.mistakes}`;
    const hint =
      finalHit.cause === 'mistake'
        ? `Każdy błąd to cios smoka za ${attack} HP.`
        : 'Szybkie cyfry i ukończone linie odpychają atak smoka.';
    this.openModal(
      new Modal(won ? `${name} pokonany!` : `${name} cię pokonał…`, won ? stats : `${hint}\n${stats}`, [
        { text: 'Walcz ponownie', variant: 'primary', onTap: () => this.options.onRestart() },
        { text: 'Menu', onTap: () => this.options.onMenu() },
      ]),
    );
  }
}
