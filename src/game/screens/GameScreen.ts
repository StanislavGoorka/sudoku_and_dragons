import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import type { Difficulty, Puzzle } from '../../core/index.ts';
import { theme } from '../theme.ts';
import { BoardView } from '../ui/BoardView.ts';
import { NumberPad } from '../ui/NumberPad.ts';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'łatwy',
  medium: 'średni',
  hard: 'trudny',
};

export class GameScreen extends Container {
  private readonly puzzle: Puzzle;
  private readonly onNewGame: () => void;

  private readonly title = new Text({
    text: 'Sudoku & Dragons',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 22, fill: theme.text },
  });
  private readonly status = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontSize: 14, fill: theme.textMuted },
  });
  // Placeholder for the battle: the enemy and the RPG effects will live here.
  private readonly arena = new Graphics();
  private readonly arenaLabel = new Text({
    text: '🐉\nArena: tu pojawi się smok',
    style: { fontFamily: theme.fontFamily, fontSize: 16, fill: theme.textMuted, align: 'center' },
  });
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  private winBanner: Container | null = null;

  private mistakes = 0;
  private finished = false;
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(puzzle: Puzzle, onNewGame: () => void) {
    super();
    this.puzzle = puzzle;
    this.onNewGame = onNewGame;

    this.title.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);
    this.arenaLabel.anchor.set(0.5);
    this.board = new BoardView(puzzle);
    this.pad = new NumberPad((digit) => this.handleDigit(digit));
    for (let digit = 1; digit <= 9; digit++) {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
    }

    this.addChild(this.arena, this.arenaLabel, this.title, this.status, this.board, this.pad);
    this.updateStatus();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const margin = 16;
    const gap = 12;
    const headerHeight = 52;
    const minArenaHeight = 120;

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

    this.arena
      .clear()
      .roundRect(left, arenaY, boardSize, arenaHeight, 14)
      .fill(theme.arena)
      .stroke({ width: 1, color: theme.lineThin });
    this.arenaLabel.position.set(width / 2, arenaY + arenaHeight / 2);

    this.board.position.set(left, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(boardSize, padHeight);

    if (this.winBanner) this.layoutWinBanner(this.winBanner);
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

  override destroy(options?: DestroyOptions): void {
    if (this.winBanner) gsap.killTweensOf([this.winBanner, this.winBanner.scale]);
    super.destroy(options);
  }

  private handleDigit(digit: number): void {
    if (this.finished) return;
    const result = this.board.place(digit);
    if (!result) return;

    if (result.kind === 'wrong') {
      this.mistakes++;
      this.updateStatus();
    } else if (result.kind === 'correct') {
      if (this.board.countOf(digit) === 9) this.pad.setDone(digit, true);
      if (result.solved) this.finish();
    }
  }

  private updateStatus(): void {
    this.status.text = `Poziom: ${DIFFICULTY_LABEL[this.puzzle.difficulty]} · Błędy: ${this.mistakes}`;
  }

  private finish(): void {
    this.finished = true;

    const banner = new Container();
    const shade = new Graphics();
    const text = new Text({
      text: `Plansza ukończona!\nBłędy: ${this.mistakes}\n\nDotknij, aby zagrać ponownie`,
      style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 24, fill: theme.text, align: 'center' },
    });
    text.anchor.set(0.5);
    banner.addChild(shade, text);
    banner.eventMode = 'static';
    banner.cursor = 'pointer';
    banner.on('pointertap', () => this.onNewGame());
    this.winBanner = banner;
    this.addChild(banner);
    this.layoutWinBanner(banner);

    banner.alpha = 0;
    gsap.to(banner, { alpha: 1, duration: 0.4, delay: 0.8 });
  }

  private layoutWinBanner(banner: Container): void {
    const [shade, text] = banner.children as [Graphics, Text];
    shade.clear().rect(0, 0, this.screenWidth, this.screenHeight).fill({ color: 0x000000, alpha: 0.7 });
    text.position.set(this.screenWidth / 2, this.screenHeight / 2);
  }
}
