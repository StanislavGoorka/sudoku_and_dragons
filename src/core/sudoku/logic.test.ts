import { describe, expect, it } from 'vitest';
import { analyzePuzzle, TECHNIQUES } from './logic.ts';
import { ALL_UNITS, PEERS, unitCells } from './grid.ts';
import { generatePuzzle } from './generator.ts';
import { solve } from './solver.ts';
import { PUZZLE_BANK } from './puzzleBank.ts';

const units = ALL_UNITS.map(unitCells);
describe('human-technique analyzer', () => {
  it('does not guess or label an unsupported board as hard', () => {
    const empty = new Array(81).fill(0);
    expect(analyzePuzzle(empty)).toMatchObject({ status: 'stalled', difficulty: null, grid: empty, steps: [] });
    const unsupported = generatePuzzle(2, 'hard', 1);
    expect(analyzePuzzle(unsupported.givens)).toMatchObject({ status: 'stalled', difficulty: null });
  });
  it('rejects malformed, conflicting and impossible boards without mutating them', () => {
    for (const grid of [[], new Array(81).fill(10), new Array(81).fill(1),
      [0,...[1,2,3,4,5,6,7,8],9,...new Array(71).fill(0)]]) {
      const before = [...grid];
      expect(analyzePuzzle(grid).status).toBe('invalid'); expect(grid).toEqual(before);
    }
  });
  it('distinguishes techniques rather than clue count', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const p = [...PUZZLE_BANK[level][0]].map(Number), a = analyzePuzzle(p);
      expect(a.status).toBe('solved'); expect(a.difficulty).toBe(level);
      expect(a.grid).toEqual(solve(p));
    }
    // These all have 26 clues, yet require different reasoning.
    expect([3,1,32].map(seed=>analyzePuzzle(generatePuzzle(seed,'hard',1).givens).difficulty)).toEqual(['easy','medium','hard']);
  });
  it('independently checks every traced placement/elimination and exercises all four techniques', () => {
    const seen = new Set<string>();
    for (const seed of [3,1,16,32,46]) {
      const p = generatePuzzle(seed, 'hard', 1), before = [...p.givens];
      const a = analyzePuzzle(p.givens, 'hard', true);
      expect(a.status).toBe('solved'); expect(p.givens).toEqual(before);
      const grid = [...p.givens];
      const masks = grid.map((d,c)=>d ? 0 : [1,2,3,4,5,6,7,8,9].filter(n=>PEERS[c].every(peer=>grid[peer]!==n)).reduce((m,n)=>m|(1<<n),0));
      for (const step of a.steps) {
        seen.add(step.technique);
        if (step.technique === 'single' || step.technique === 'hidden-single') {
          const cell = step.cells[0], digit = step.digit!;
          expect(digit).toBe(p.solution[cell]);
          if (step.technique === 'single') expect(masks[cell]).toBe(1<<digit);
          else expect(units.some(u=>u.includes(cell)&&u.filter(c=>masks[c]&(1<<digit)).length===1)).toBe(true);
          grid[cell]=digit; masks[cell]=0;
        } else if (step.technique === 'naked-pair') {
          expect(step.cells).toHaveLength(2);
          expect(masks[step.cells[0]]).toBe(masks[step.cells[1]]);
          expect(masks[step.cells[0]].toString(2).replaceAll('0','')).toHaveLength(2);
          for(const removal of step.removed) expect(units.some(u=>step.cells.every(c=>u.includes(c))&&u.includes(removal.cell))).toBe(true);
        } else {
          const sources=units.filter(u=>step.cells.every(c=>u.includes(c))&&u.filter(c=>masks[c]&(1<<step.digit!)).every(c=>step.cells.includes(c)));
          expect(sources.length).toBeGreaterThan(0);
          for(const removal of step.removed) expect(sources.some(source=>!source.includes(removal.cell)&&units.some(u=>u.includes(removal.cell)&&step.cells.every(c=>u.includes(c))))).toBe(true);
        }
        for (const removal of step.removed) {
          expect(removal.mask & (1<<p.solution[removal.cell])).toBe(0);
          expect(removal.mask & masks[removal.cell]).toBe(removal.mask);
          masks[removal.cell] &= ~removal.mask;
        }
      }
      expect(grid).toEqual(p.solution);
    }
    expect([...seen].sort()).toEqual([...TECHNIQUES].sort());
  });
});
