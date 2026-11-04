import type { Rng } from '../rng.ts';
import type { Difficulty } from '../sudoku/generator.ts';
import { ALL_UNITS, PEERS, unitCells, unitsOf, type Grid } from '../sudoku/grid.ts';
import { analyzePuzzle, type Technique } from '../sudoku/logic.ts';
import { closesBox, moveDamage } from '../battle/battle.ts';
import type { DuelState } from './duel.ts';

/** How a training bot plays: how often it slips, how long it thinks, and whether it plays tactically. */
export interface BotLevel {
  /** Maximum reasoning repertoire, independent of the puzzle's difficulty. */
  techniques: Difficulty;
  /** Chance that a digit is wrong. */
  mistakeRate: number;
  /** Milliseconds it thinks before each digit, picked between these. */
  thinkMs: [number, number];
  /** Goes for damage and keeps the rival from closing boxes; otherwise any empty cell. */
  smart: boolean;
}

export type BotStrength = Difficulty;
/** Strength is selected independently of board difficulty. A stumped bot waits out its turn. */
export const BOT_LEVELS: Record<Difficulty, BotLevel> = {
  easy: { techniques: 'easy', mistakeRate: 0.08, thinkMs: [5500, 8500], smart: false },
  medium: { techniques: 'medium', mistakeRate: 0.035, thinkMs: [3800, 6000], smart: true },
  hard: { techniques: 'hard', mistakeRate: 0.01, thinkMs: [2200, 4200], smart: true },
};

export interface LogicalMove { cell: number; digit: number; technique: Technique }
const candidates = (board: Grid, cell: number) => [1,2,3,4,5,6,7,8,9].filter(d => PEERS[cell].every(p => board[p] !== d));

/** Deductions from public digits only; neither a solution nor the player's notes are accepted. */
export function logicalMoves(board: Grid, repertoire: Difficulty): LogicalMove[] {
  const allowed = board.map((d,c) => d ? [] : candidates(board,c));
  const singles = allowed.flatMap((digits,cell) => digits.length === 1 ? [{cell,digit:digits[0],technique:'single' as const}] : []);
  if (singles.length || repertoire === 'easy') return singles;
  const hidden = new Map<string, LogicalMove>();
  for (const unit of ALL_UNITS) for (let digit=1;digit<=9;digit++) {
    const cells = unitCells(unit).filter(c => allowed[c].includes(digit));
    if (cells.length === 1) hidden.set(`${cells[0]}/${digit}`, {cell:cells[0],digit,technique:'hidden-single'});
  }
  if (hidden.size || repertoire === 'medium') return [...hidden.values()];
  const analysis = analyzePuzzle(board, 'hard', true);
  if (analysis.status === 'invalid') return [];
  const first = analysis.steps.findIndex(s => s.technique === 'single' || s.technique === 'hidden-single');
  if (first < 0) return [];
  const step = analysis.steps[first];
  return [{cell:step.cells[0], digit:step.digit!, technique:analysis.steps[0].technique}];
}

/** Visible-board tactical score; unknown rival digits are estimated conservatively, never read. */
export function tacticalScore(state: DuelState, move: LogicalMove): number {
  let completes=0, boxed=false, gift=0;
  for (const unit of unitsOf(move.cell)) {
    const empty = unitCells(unit).filter(c => !state.board[c]);
    if (empty.length === 1) { completes++; if (unit.kind === 'box') boxed=true; }
    if (unit.kind === 'box' && empty.length === 2) {
      const last=empty.find(c=>c!==move.cell)!;
      gift = 2 * Math.max(...candidates(state.board,last));
    }
  }
  const passes = state.movesLeft === 1 && completes === 0;
  return moveDamage(move.digit,boxed)+(completes ? 6 : 0)-gift*(passes ? 1 : .2);
}

export function chooseBotMove(state: DuelState, level: BotLevel, rng: Rng): LogicalMove | null {
  if (state.finished) return null;
  const moves = logicalMoves(state.board,level.techniques);
  if (!moves.length) return null;
  let move=moves[Math.floor(rng()*moves.length)];
  if (level.smart) {
    let best=-Infinity;
    for (const option of moves) {
      const score=tacticalScore(state,option)+rng()*.2;
      if (score>best) { best=score; move=option; }
    }
  }
  return rng()<level.mistakeRate ? {...move,digit:move.digit%9+1} : move;
}

/** Empty cells of a unit. */
function gaps(board: Grid, cells: number[]): number {
  let count = 0;
  for (const cell of cells) if (board[cell] === 0) count++;
  return count;
}

/** Whether filling `cell` closes a box, for tests and callers that want to know without playing. */
export function wouldCloseBox(board: Grid, cell: number): boolean {
  return closesBox(unitsOf(cell).filter((unit) => gaps(board, unitCells(unit)) === 1));
}
