import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions, type PointData } from 'pixi.js';
import { boxOf, CELL_COUNT, colOf, rowOf, unitCells, type Grid, type Unit } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';

class CellView extends Container {
  /** Drawn white once; the state colour is applied as a tint. */
  readonly bg = new Graphics();
  /** White overlay tinted per effect (gold for completed units, red for mistakes). */
  readonly flash = new Graphics();
  readonly digit = new Text({ text: '', style: { fontFamily: theme.fontFamily, fontWeight: '700' } });
  homeX = 0;
  homeY = 0;

  constructor() {
    super();
    this.flash.alpha = 0;
    this.digit.anchor.set(0.5);
    this.addChild(this.bg, this.flash, this.digit);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }
}

function distance(a: number, b: number): number {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
}

/**
 * The sudoku board on screen. It does not judge moves: the caller checks a digit (locally with core
 * against the solution, or on the server in a duel) and then tells the board what happened.
 */
export class BoardView extends Container {
  /** Width of the tray around the cells; screens leave this much room around the board (plus 5 below for its lip). */
  static readonly BORDER = 6;
  /** What the board shows: givens plus revealed digits. */
  readonly board: Grid;
  selected: number | null = null;

  private readonly cells: CellView[] = [];
  /** The violet tray the board sits in, with a darker lip below. */
  private readonly tray = new Graphics();
  private readonly lines = new Graphics();
  private readonly ghosts = new Set<Text>();
  private cellSize = 0;

  constructor(givens: Grid) {
    super();
    this.board = [...givens];
    this.tray.eventMode = 'none';
    this.addChild(this.tray);

    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const view = new CellView();
      const value = this.board[cell];
      view.digit.text = value === 0 ? '' : String(value);
      view.digit.style.fill = value === 0 ? theme.placed : theme.given;
      view.on('pointertap', () => {
        feedback.select();
        this.select(cell);
      });
      this.cells.push(view);
      this.addChild(view);
    }
    this.lines.eventMode = 'none';
    this.addChild(this.lines);
  }

  layout(size: number): void {
    const s = size / 9;
    this.cellSize = s;
    this.cells.forEach((view, cell) => {
      gsap.killTweensOf(view);
      view.homeX = colOf(cell) * s;
      view.homeY = rowOf(cell) * s;
      view.position.set(view.homeX, view.homeY);
      view.hitArea = new Rectangle(0, 0, s, s);
      view.bg.clear().rect(0, 0, s, s).fill(0xffffff);
      view.flash.clear().rect(0, 0, s, s).fill(0xffffff);
      // Baloo sits a little high in its line box.
      view.digit.position.set(s / 2, s / 2 + s * 0.04);
      view.digit.style.fontSize = Math.round(s * 0.62);
    });
    this.drawLines(size);
    this.refresh();
  }

  select(cell: number): void {
    this.selected = cell;
    this.refresh();
  }

  moveSelection(dRow: number, dCol: number): void {
    const current = this.selected ?? 40;
    const row = (rowOf(current) + dRow + 9) % 9;
    const col = (colOf(current) + dCol + 9) % 9;
    this.select(row * 9 + col);
  }

  /** Shows a correct digit with its pop, plus a golden wave through every unit it completed. */
  reveal(cell: number, digit: number, completed: Unit[], color: number = theme.placed): void {
    this.board[cell] = digit;
    this.cells[cell].digit.style.fill = color;
    this.animateCorrect(cell);
    completed.forEach((unit, i) => this.animateUnit(unit, cell, 0.1 + i * 0.12));
    this.refresh();
  }

  /** Shows a wrong digit bouncing off the cell; nothing is written. */
  reject(cell: number, digit: number): void {
    this.animateWrong(cell, digit);
    this.refresh();
  }

  /**
   * Catches up with `board` without animation: after missing updates in a duel, or to take back
   * digits the server did not accept.
   */
  sync(board: Grid, color: number = theme.placed): void {
    board.forEach((digit, cell) => {
      if (this.board[cell] === digit) return;
      this.board[cell] = digit;
      const view = this.cells[cell];
      killTweens(view.digit.scale);
      view.digit.scale.set(1);
      view.digit.text = digit === 0 ? '' : String(digit);
      view.digit.style.fill = color;
    });
    this.refresh();
  }

  countOf(digit: number): number {
    return this.board.filter((value) => value === digit).length;
  }

  /** Centre of a cell, in board coordinates. */
  cellCenter(cell: number): PointData {
    const s = this.cellSize;
    return { x: colOf(cell) * s + s / 2, y: rowOf(cell) * s + s / 2 };
  }

  /** Centre of a row, column or box, in board coordinates. */
  unitCenter(unit: Unit): PointData {
    const centers = unitCells(unit).map((cell) => this.cellCenter(cell));
    return {
      x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
      y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length,
    };
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(...this.ghosts);
    for (const view of this.cells) killTweens(view, view.flash, view.digit.scale);
    super.destroy(options);
  }

  private refresh(): void {
    const sel = this.selected;
    const selDigit = sel === null ? 0 : this.board[sel];
    this.cells.forEach((view, cell) => {
      let color: number = theme.cell;
      if (cell === sel) {
        color = theme.cellSelected;
      } else if (selDigit !== 0 && this.board[cell] === selDigit) {
        color = theme.cellSameDigit;
      } else if (
        sel !== null &&
        (rowOf(cell) === rowOf(sel) || colOf(cell) === colOf(sel) || boxOf(cell) === boxOf(sel))
      ) {
        color = theme.cellPeer;
      }
      view.bg.tint = color;
    });
  }

  private drawLines(size: number): void {
    const s = size / 9;
    const border = BoardView.BORDER;
    this.tray
      .clear()
      .roundRect(-border, -border + 5, size + border * 2, size + border * 2, 16)
      .fill(theme.boardFrameLip)
      .roundRect(-border, -border, size + border * 2, size + border * 2, 16)
      .fill(theme.boardFrame);
    const g = this.lines.clear();
    for (let k = 1; k < 9; k++) {
      if (k % 3 === 0) continue;
      g.moveTo(k * s, 0).lineTo(k * s, size).moveTo(0, k * s).lineTo(size, k * s);
    }
    g.stroke({ width: 1.5, color: theme.lineThin });
    for (const k of [3, 6]) {
      g.moveTo(k * s, 0).lineTo(k * s, size).moveTo(0, k * s).lineTo(size, k * s);
    }
    g.stroke({ width: 3, color: theme.boxLine });
  }

  private animateCorrect(cell: number): void {
    const view = this.cells[cell];
    view.digit.text = String(this.board[cell]);
    gsap.fromTo(view.digit.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
  }

  /** A golden wave that runs through the unit outward from the cell that completed it. */
  private animateUnit(unit: Unit, origin: number, delay: number): void {
    const cells = unitCells(unit).sort((a, b) => distance(a, origin) - distance(b, origin));
    cells.forEach((cell, i) => {
      const view = this.cells[cell];
      const at = delay + i * 0.04;
      view.flash.tint = theme.flash;
      gsap.fromTo(
        view.flash,
        { alpha: 0.85 },
        { alpha: 0, duration: 0.6, delay: at, ease: 'power2.out', immediateRender: false },
      );
      if (cell === origin) return;
      gsap.fromTo(
        view.digit.scale,
        { x: 1.35, y: 1.35 },
        { x: 1, y: 1, duration: 0.4, delay: at, ease: 'back.out(2)', immediateRender: false },
      );
    });
  }

  private animateWrong(cell: number, digit: number): void {
    const view = this.cells[cell];
    gsap.killTweensOf(view);
    gsap.fromTo(view, { x: view.homeX - 6 }, { x: view.homeX, duration: 0.5, ease: 'elastic.out(1.2, 0.2)' });

    view.flash.tint = theme.error;
    gsap.fromTo(view.flash, { alpha: 0.7 }, { alpha: 0, duration: 0.5 });

    // The wrong digit floats up and fades; it is never written into the board.
    const ghost = new Text({
      text: String(digit),
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '600',
        fontSize: view.digit.style.fontSize,
        fill: theme.error,
      },
    });
    ghost.anchor.set(0.5);
    ghost.position.copyFrom(view.digit.position);
    view.addChild(ghost);
    this.ghosts.add(ghost);
    gsap.to(ghost, {
      y: ghost.y - this.cellSize * 0.6,
      alpha: 0,
      duration: 0.7,
      ease: 'power1.in',
      onComplete: () => {
        this.ghosts.delete(ghost);
        ghost.destroy();
      },
    });
  }
}
