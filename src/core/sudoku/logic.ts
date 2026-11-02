import { ALL_UNITS, PEERS, boxOf, colOf, rowOf, unitCells, type Grid } from './grid.ts';
import type { Difficulty } from './generator.ts';

export type Technique = 'single' | 'hidden-single' | 'locked-candidate' | 'naked-pair';
export const TECHNIQUES: readonly Technique[] = ['single', 'hidden-single', 'locked-candidate', 'naked-pair'];
export interface LogicalStep {
  technique: Technique;
  /** Cells establishing the deduction; this is an analysis tool, never automatic player notes. */
  cells: number[];
  digit?: number;
  removed: { cell: number; mask: number }[];
}
export interface LogicalAnalysis {
  status: 'solved' | 'stalled' | 'invalid';
  difficulty: Difficulty | null;
  grid: Grid;
  counts: Record<Technique, number>;
  steps: LogicalStep[];
}
const UNITS = ALL_UNITS.map(unitCells);
const ALL = 1022;
const count = (mask: number): number => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };
const digitOf = (mask: number): number => 31 - Math.clz32(mask);

/** Sound, deterministic deductions only: no search, guesses or access to a solution. */
export function analyzePuzzle(givens: readonly number[], maxLevel: Difficulty = 'hard', trace = false): LogicalAnalysis {
  const grid = [...givens];
  const masks = new Uint16Array(81);
  const counts: Record<Technique, number> = { single: 0, 'hidden-single': 0, 'locked-candidate': 0, 'naked-pair': 0 };
  const steps: LogicalStep[] = [];
  const result = (status: LogicalAnalysis['status']): LogicalAnalysis => ({ status, grid, counts, steps,
    difficulty: status !== 'solved' ? null : counts['locked-candidate'] + counts['naked-pair'] > 0 ? 'hard' : counts['hidden-single'] > 0 ? 'medium' : 'easy' });
  if (grid.length !== 81 || grid.some((d) => !Number.isInteger(d) || d < 0 || d > 9)) return result('invalid');
  if (grid.some((d, i) => d !== 0 && PEERS[i].some((p) => grid[p] === d))) return result('invalid');
  for (let cell = 0; cell < 81; cell++) if (!grid[cell]) {
    let mask = ALL;
    for (const peer of PEERS[cell]) mask &= ~(1 << grid[peer]);
    masks[cell] = mask;
  }
  const place = (cell: number, digit: number, technique: Technique): LogicalStep => {
    grid[cell] = digit; masks[cell] = 0;
    const removed: LogicalStep['removed'] = [];
    for (const peer of PEERS[cell]) if (masks[peer] & (1 << digit)) {
      masks[peer] &= ~(1 << digit); removed.push({ cell: peer, mask: 1 << digit });
    }
    return { technique, cells: [cell], digit, removed };
  };
  const remove = (cells: number[], bits: number, excluded: number[], technique: Technique): LogicalStep | null => {
    const removed: LogicalStep['removed'] = [];
    for (const cell of cells) if (!excluded.includes(cell) && masks[cell] & bits) {
      const mask = masks[cell] & bits; masks[cell] &= ~bits; removed.push({ cell, mask });
    }
    return removed.length ? { technique, cells: excluded, removed } : null;
  };
  // Every pass places a digit or removes at least one of at most 729 candidate bits.
  for (let pass = 0; pass < 810; pass++) {
    if (grid.some((d, i) => !d && !masks[i])) return result('invalid');
    for (const unit of UNITS) {
      let possible = 0;
      for (const cell of unit) possible |= grid[cell] ? 1 << grid[cell] : masks[cell];
      if (possible !== ALL) return result('invalid');
    }
    if (grid.every((d) => d !== 0)) return result('solved');
    let step: LogicalStep | null = null;
    const single = grid.findIndex((d, cell) => !d && count(masks[cell]) === 1);
    if (single !== -1) step = place(single, digitOf(masks[single]), 'single');
    if (!step && maxLevel !== 'easy') outer: for (const unit of UNITS) for (let digit = 1; digit <= 9; digit++) {
      const cells = unit.filter((cell) => masks[cell] & (1 << digit));
      if (cells.length === 1) { step = place(cells[0], digit, 'hidden-single'); break outer; }
    }
    if (!step && maxLevel === 'hard') outer: for (let u = 0; u < UNITS.length; u++) for (let digit = 1; digit <= 9; digit++) {
      const cells = UNITS[u].filter((cell) => masks[cell] & (1 << digit));
      if (cells.length < 2) continue;
      // Pointing (box to line) and claiming (line to box).
      const targets = u >= 18
        ? [cells.every((c) => rowOf(c) === rowOf(cells[0])) ? UNITS[rowOf(cells[0])] : [],
          cells.every((c) => colOf(c) === colOf(cells[0])) ? UNITS[9 + colOf(cells[0])] : []]
        : [cells.every((c) => boxOf(c) === boxOf(cells[0])) ? UNITS[18 + boxOf(cells[0])] : []];
      for (const target of targets) {
        step = remove(target, 1 << digit, UNITS[u], 'locked-candidate');
        if (step) { step.cells = cells; step.digit = digit; break outer; }
      }
    }
    if (!step && maxLevel === 'hard') outer: for (const unit of UNITS) for (const cell of unit) {
      if (count(masks[cell]) !== 2) continue;
      const pair = unit.filter((c) => masks[c] === masks[cell]);
      if (pair.length !== 2) continue;
      step = remove(unit, masks[cell], pair, 'naked-pair');
      if (step) break outer;
    }
    if (!step) return result('stalled');
    counts[step.technique]++;
    if (trace) steps.push(step);
  }
  return result('stalled');
}
