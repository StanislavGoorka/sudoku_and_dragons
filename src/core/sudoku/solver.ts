import type { Rng } from '../rng.ts';
import { shuffle } from '../rng.ts';
import { boxOf, CELL_COUNT, colOf, rowOf, type Grid } from './grid.ts';

// Candidate sets are bitmasks: bit d set means digit d (1–9) is used/allowed.
const ALL_DIGITS = 0b11_1111_1110;

const ROW = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => rowOf(cell));
const COL = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => colOf(cell));
const BOX = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => boxOf(cell));

interface Search {
  grid: Grid;
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
  limit: number;
  found: number;
  firstSolution: Grid | null;
  rng: Rng | undefined;
}

function bitCount(mask: number): number {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

function digitsOf(mask: number): number[] {
  const digits: number[] = [];
  for (let d = 1; d <= 9; d++) {
    if (mask & (1 << d)) digits.push(d);
  }
  return digits;
}

/** Returns null when the given digits already break a sudoku rule. */
function createSearch(puzzle: Grid, limit: number, rng?: Rng): Search | null {
  if (puzzle.length !== CELL_COUNT) throw new Error(`Expected ${CELL_COUNT} cells`);
  const search: Search = {
    grid: [...puzzle],
    rows: new Uint16Array(9),
    cols: new Uint16Array(9),
    boxes: new Uint16Array(9),
    limit,
    found: 0,
    firstSolution: null,
    rng,
  };
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const digit = puzzle[cell];
    if (digit === 0) continue;
    const bit = 1 << digit;
    const r = ROW[cell], c = COL[cell], b = BOX[cell];
    if ((search.rows[r] | search.cols[c] | search.boxes[b]) & bit) return null;
    search.rows[r] |= bit;
    search.cols[c] |= bit;
    search.boxes[b] |= bit;
  }
  return search;
}

/** Depth-first search that always branches on the cell with the fewest candidates. Returns true to stop. */
function run(s: Search): boolean {
  let bestCell = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (s.grid[cell] !== 0) continue;
    const mask = ~(s.rows[ROW[cell]] | s.cols[COL[cell]] | s.boxes[BOX[cell]]) & ALL_DIGITS;
    const count = bitCount(mask);
    if (count === 0) return false;
    if (count < bestCount) {
      bestCell = cell;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }

  if (bestCell === -1) {
    s.found++;
    s.firstSolution ??= [...s.grid];
    return s.found >= s.limit;
  }

  const digits = digitsOf(bestMask);
  if (s.rng) shuffle(digits, s.rng);
  const r = ROW[bestCell], c = COL[bestCell], b = BOX[bestCell];
  for (const digit of digits) {
    const bit = 1 << digit;
    s.grid[bestCell] = digit;
    s.rows[r] |= bit;
    s.cols[c] |= bit;
    s.boxes[b] |= bit;
    const stop = run(s);
    s.grid[bestCell] = 0;
    s.rows[r] &= ~bit;
    s.cols[c] &= ~bit;
    s.boxes[b] &= ~bit;
    if (stop) return true;
  }
  return false;
}

/** Counts solutions, stopping early at `limit` (2 is enough to test uniqueness). */
export function countSolutions(puzzle: Grid, limit = 2): number {
  const search = createSearch(puzzle, limit);
  if (!search) return 0;
  run(search);
  return search.found;
}

/** Returns a solution, or null when there is none. */
export function solve(puzzle: Grid): Grid | null {
  const search = createSearch(puzzle, 1);
  if (!search) return null;
  run(search);
  return search.firstSolution;
}

/** Returns a random solution of the puzzle (an empty grid gives a random full board). */
export function solveRandom(puzzle: Grid, rng: Rng): Grid | null {
  const search = createSearch(puzzle, 1, rng);
  if (!search) return null;
  run(search);
  return search.firstSolution;
}
