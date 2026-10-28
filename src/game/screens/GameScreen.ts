import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import {
  createBattle,
  DRAGON,
  resolveMove,
  type Battle,
  type Difficulty,
  type Hit,
  type Puzzle,
  type Unit,
} from '../../core/index.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import { theme } from '../theme.ts';
import { BattleArena } from '../ui/BattleArena.ts';
import { BoardView } from '../ui/BoardView.ts';
import { NumberPad } from '../ui/NumberPad.ts';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'łatwy',
  medium: 'średni',
  hard: 'trudny',
};

export class GameScreen extends Container {
  private readonly puzzle: Puzzle;
  private readonly battle: Battle;
  private readonly onNewGame: () => void;

  private readonly title = new Text({
    text: 'Sudoku & Dragons',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 22, fill: theme.text },
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
  private endBanner: Container | null = null;

  private mistakes = 0;
  private endShown = false;
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(puzzle: Puzzle, onNewGame: () => void) {
    super();
    this.puzzle = puzzle;
    this.battle = createBattle(DRAGON);
    this.onNewGame = onNewGame;

    this.title.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);
    this.arena = new BattleArena(DRAGON.name, DRAGON.maxHp, this.battle.playerMaxHp);
    this.board = new BoardView(puzzle);
    this.pad = new NumberPad((digit) => this.handleDigit(digit));
    for (let digit = 1; digit <= 9; digit++) {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
    }
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;

    this.addChild(this.arena, this.title, this.status, this.board, this.pad, this.hurtFlash, this.fx);
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

    this.arena.position.set(left, arenaY);
    this.arena.layout(boardSize, arenaHeight);
    this.board.position.set(left, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(boardSize, padHeight);

    this.hurtFlash.clear().rect(0, 0, width, height).fill(theme.error);
    if (this.endBanner) this.layoutEndBanner(this.endBanner);
  }

  handleKey(event: KeyboardEvent): void {
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
    if (this.endBanner) gsap.killTweensOf(this.endBanner);
    super.destroy(options);
  }

  private handleDigit(digit: number): void {
    if (this.battle.outcome !== 'ongoing') return;
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
    const completed = result.kind === 'correct' ? result.completed : [];
    void this.playHit(hit, cell, completed);
  }

  private async playHit(hit: Hit, cell: number, completed: Unit[]): Promise<void> {
    if (hit.target === 'enemy') {
      await this.playPlayerAttack(hit, cell, completed);
    } else {
      await this.playDragonAttack(hit);
    }
    // Only the hit that brought someone to 0 HP ends the battle; earlier hits may still be landing.
    if (!this.destroyed && hit.hpAfter === 0) await this.showEnd();
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
    this.status.text = `Poziom: ${DIFFICULTY_LABEL[this.puzzle.difficulty]} · Błędy: ${this.mistakes}`;
  }

  private async showEnd(): Promise<void> {
    if (this.endShown) return;
    this.endShown = true;

    const won = this.battle.outcome === 'won';
    if (won) {
      await this.arena.dragon.die();
    } else {
      await wait(0.6);
    }
    if (this.destroyed) return;

    const banner = new Container();
    const shade = new Graphics();
    const message = won
      ? `Smok pokonany!\nBłędy: ${this.mistakes}\n\nDotknij, aby walczyć dalej`
      : 'Smok cię pokonał…\n\nDotknij, aby spróbować ponownie';
    const text = new Text({
      text: message,
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '700',
        fontSize: 24,
        fill: theme.text,
        align: 'center',
        wordWrap: true,
      },
    });
    text.anchor.set(0.5);
    banner.addChild(shade, text);
    banner.eventMode = 'static';
    banner.cursor = 'pointer';
    banner.on('pointertap', () => this.onNewGame());
    this.endBanner = banner;
    this.addChild(banner);
    this.layoutEndBanner(banner);

    banner.alpha = 0;
    gsap.to(banner, { alpha: 1, duration: 0.4 });
  }

  private layoutEndBanner(banner: Container): void {
    const [shade, text] = banner.children as [Graphics, Text];
    shade.clear().rect(0, 0, this.screenWidth, this.screenHeight).fill({ color: 0x000000, alpha: 0.7 });
    text.style.wordWrapWidth = Math.min(this.screenWidth - 48, 420);
    text.position.set(this.screenWidth / 2, this.screenHeight / 2);
  }
}
