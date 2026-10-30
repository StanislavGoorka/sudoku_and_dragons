import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '../rng.ts';
import { generatePuzzle } from '../sudoku/generator.ts';
import { applyMove } from '../sudoku/moves.ts';
import { createBattle, resolveMove } from './battle.ts';
import { nextStage, REGIONS, stageById, STAGES, type Stage } from './campaign.ts';
import { ENEMIES } from './enemies.ts';

/** Plays a board perfectly in a random order; returns the share of empty cells filled when the dragon fell. */
function fallsAt(seed: number, stage: Stage): number {
  const { givens, solution } = generatePuzzle(seed, stage.region.difficulty);
  const board = [...givens];
  const order = shuffle(givens.flatMap((v, i) => (v === 0 ? [i] : [])), createRng(seed));
  const battle = createBattle(stage.enemy);
  for (let k = 0; k < order.length; k++) {
    resolveMove(battle, applyMove(board, solution, order[k], solution[order[k]]));
    if (battle.outcome === 'won') return (k + 1) / order.length;
  }
  return Number.NaN;
}

describe('the campaign', () => {
  it('has three regions in difficulty order, each ending with its boss', () => {
    expect(REGIONS.map((r) => r.difficulty)).toEqual(['easy', 'medium', 'hard']);
    for (const region of REGIONS) {
      expect(region.stages.at(-1)!.boss).toBe(true);
      expect(region.stages.filter((s) => s.boss)).toHaveLength(1);
      region.stages.forEach((stage, i) => {
        expect(stage.number).toBe(i + 1);
        expect(stage.region).toBe(region);
      });
    }
  });

  it('has unique stage ids, and the plain dragons of each difficulty open their regions', () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    expect(REGIONS[0].stages[0].enemy).toBe(ENEMIES.easy);
    expect(REGIONS[1].stages[0].enemy).toBe(ENEMIES.medium);
    expect(stageById('peaks-2')?.enemy.name).toBe('Płomienny smok');
    expect(nextStage(REGIONS[0].stages[3])).toBe(REGIONS[1].stages[0]);
    expect(nextStage(STAGES.at(-1)!)).toBeNull();
  });

  it('gets harder along each region: a timer no slower and mistakes no cheaper; the boss has the most HP', () => {
    for (const region of REGIONS) {
      for (let i = 1; i < region.stages.length; i++) {
        const [a, b] = [region.stages[i - 1].enemy, region.stages[i].enemy];
        expect(b.attack).toBeGreaterThanOrEqual(a.attack);
        expect(b.attackEvery / b.timedAttack).toBeLessThanOrEqual(a.attackEvery / a.timedAttack);
      }
      const boss = region.stages.at(-1)!.enemy;
      for (const stage of region.stages.slice(0, -1)) expect(boss.maxHp).toBeGreaterThan(stage.enemy.maxHp);
    }
  });

  // As for the plain dragons (enemies.test.ts): enough HP to fall with the last digits of the board.
  for (const stage of STAGES) {
    it(`${stage.id}: the dragon falls with the last digits of the board`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) expect(fallsAt(seed, stage)).toBeGreaterThanOrEqual(0.85);
    });
  }
});
