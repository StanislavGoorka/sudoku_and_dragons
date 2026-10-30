import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '../rng.ts';
import { generatePuzzle, type Difficulty } from '../sudoku/generator.ts';
import { applyMove } from '../sudoku/moves.ts';
import { createBattle, resolveMove } from './battle.ts';
import { ENEMIES } from './enemies.ts';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Plays a board perfectly in a random order; returns the share of empty cells filled when the enemy fell. */
function fallsAt(seed: number, difficulty: Difficulty): number {
  const { givens, solution } = generatePuzzle(seed, difficulty);
  const board = [...givens];
  const order = shuffle(givens.flatMap((v, i) => (v === 0 ? [i] : [])), createRng(seed));
  const battle = createBattle(ENEMIES[difficulty]);
  for (let k = 0; k < order.length; k++) {
    resolveMove(battle, applyMove(board, solution, order[k], solution[order[k]]));
    if (battle.outcome === 'won') return (k + 1) / order.length;
  }
  return Number.NaN;
}

describe('enemies', () => {
  it('get tougher with the difficulty', () => {
    const [easy, medium, hard] = DIFFICULTIES.map((d) => ENEMIES[d]);
    expect(easy.attack).toBeLessThan(medium.attack);
    expect(medium.attack).toBeLessThan(hard.attack);
    expect(easy.attackEvery).toBeGreaterThan(medium.attackEvery);
    expect(medium.attackEvery).toBeGreaterThan(hard.attackEvery);
  });

  // Guards the balance: with too little HP the dragon would fall long before the board is done.
  // (Too much HP is harmless: solving the board is always a finishing blow.)
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: the enemy falls with the last digits of the board`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(fallsAt(seed, difficulty)).toBeGreaterThanOrEqual(0.85);
      }
    });
  }
});
