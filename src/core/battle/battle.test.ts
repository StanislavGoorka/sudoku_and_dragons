import { describe, expect, it } from 'vitest';
import type { Unit } from '../sudoku/grid.ts';
import type { MoveResult } from '../sudoku/moves.ts';
import {
  advanceTime,
  attackInterval, battleKnockback, bossHint, nextTimedDamage,
  BOX_MULTIPLIER,
  createBattle,
  moveDamage,
  moveKnockback,
  resolveMove,
  type EnemyDef,
} from './battle.ts';

const ENEMY: EnemyDef = { id: 'test', name: 'Test', maxHp: 100, attack: 10, attackEvery: 20, timedAttack: 5 };

/** A correct `digit` completing `units` rows (or, with `box`, a 3×3 box among them). */
function correct(digit: number, units = 0, solved = false, box = false): MoveResult {
  const completed: Unit[] = Array.from({ length: units }, (_, index) => ({ kind: box && index === 0 ? 'box' : 'row', index }));
  return { kind: 'correct', digit, completed, solved };
}

const WRONG: MoveResult = { kind: 'wrong', expected: 1 };

describe('battle', () => {
  it('a raging boss changes phase without turning a correct hit into an instant attack', () => {
    const battle = createBattle({ ...ENEMY, pattern: 'rage' });
    battle.enemyHp = 51; battle.charge = 19;
    resolveMove(battle, correct(2));
    expect(attackInterval(battle)).toBe(17);
    expect(battle.charge).toBeCloseTo(19 * 0.85 - 2);
    expect(advanceTime(battle, 0.1)).toBeNull();
    expect(bossHint(battle)).toContain('Furia');
  });
  it('a heavy boss announces the third attack before striking for extra damage', () => {
    const battle = createBattle({ ...ENEMY, pattern: 'heavy' });
    expect(advanceTime(battle, 20)?.damage).toBe(5);
    expect(advanceTime(battle, 20)?.damage).toBe(5);
    expect(bossHint(battle)).toContain('Następny');
    expect(nextTimedDamage(battle)).toBe(7);
    expect(advanceTime(battle, 20)?.damage).toBe(7);
    expect(nextTimedDamage(battle)).toBe(5);
  });
  it('a relentless phase reduces plain-digit knockback but keeps the box damage rule', () => {
    const battle = createBattle({ ...ENEMY, pattern: 'relentless' });
    battle.enemyHp = 50; battle.charge = 15;
    expect(battleKnockback(battle, 0)).toBe(1);
    expect(battleKnockback(battle, 1)).toBe(6);
    expect(resolveMove(battle, correct(4, 1, false, true))?.damage).toBe(8);
    expect(battle.charge).toBe(9);
  });
  it('starts with full HP on both sides', () => {
    expect(createBattle(ENEMY, 30)).toMatchObject({ enemyHp: 100, playerHp: 30, outcome: 'ongoing' });
  });

  it('a digit deals its own value, doubled when it closes a 3×3 box', () => {
    expect(moveDamage(5, false)).toBe(5);
    expect(moveDamage(1, false)).toBe(1);
    expect(moveDamage(3, true)).toBe(3 * BOX_MULTIPLIER);
    expect(moveDamage(9, true)).toBe(18);
  });

  it('hits the enemy for a correct digit', () => {
    const battle = createBattle(ENEMY);
    expect(resolveMove(battle, correct(7))).toEqual({
      target: 'enemy',
      cause: 'digit',
      damage: 7,
      units: 0,
      boxed: false,
      finisher: false,
      hpAfter: 93,
    });
    expect(battle.enemyHp).toBe(93);
  });

  it('only a closed box doubles the damage, not rows or columns', () => {
    const battle = createBattle(ENEMY);
    expect(resolveMove(battle, correct(4, 2))).toMatchObject({ damage: 4, units: 2, boxed: false });
    expect(resolveMove(battle, correct(4, 3, false, true))).toMatchObject({ damage: 8, units: 3, boxed: true });
  });

  it('hits the player for a wrong digit', () => {
    const battle = createBattle(ENEMY, 50);
    expect(resolveMove(battle, WRONG)).toMatchObject({ target: 'player', cause: 'mistake', damage: 10, hpAfter: 40 });
  });

  it('ignores moves on occupied cells', () => {
    expect(resolveMove(createBattle(ENEMY), { kind: 'occupied' })).toBeNull();
  });

  it('is lost when the player runs out of HP, and then ignores moves', () => {
    const battle = createBattle(ENEMY, 25);
    resolveMove(battle, WRONG);
    resolveMove(battle, WRONG);
    expect(resolveMove(battle, WRONG)).toMatchObject({ damage: 5, hpAfter: 0 });
    expect(battle.outcome).toBe('lost');
    expect(resolveMove(battle, correct(3, 3))).toBeNull();
  });

  it('is won when the enemy runs out of HP; damage never exceeds remaining HP', () => {
    const battle = createBattle({ ...ENEMY, maxHp: 12 });
    resolveMove(battle, correct(9, 1, false, true));
    expect(battle.outcome).toBe('won');
    expect(battle.enemyHp).toBe(0);
  });

  it('treats solving the board as a finishing blow', () => {
    const battle = createBattle(ENEMY);
    expect(resolveMove(battle, correct(2, 0, true))).toMatchObject({ damage: 100, finisher: true, hpAfter: 0 });
    expect(battle.outcome).toBe('won');
  });

  describe('timed attack', () => {
    it('charges with time and strikes when full, then starts over', () => {
      const battle = createBattle(ENEMY, 50);
      expect(advanceTime(battle, 19.9)).toBeNull();
      expect(advanceTime(battle, 0.2)).toEqual({
        target: 'player',
        cause: 'timer',
        damage: 5,
        units: 0,
        boxed: false,
        finisher: false,
        hpAfter: 45,
      });
      expect(battle.charge).toBe(0);
    });

    it('is pushed back by correct digits, more for completed units', () => {
      expect(moveKnockback(0)).toBe(2);
      expect(moveKnockback(2)).toBe(12);
      const battle = createBattle(ENEMY);
      advanceTime(battle, 15);
      resolveMove(battle, correct(6, 1));
      expect(battle.charge).toBe(15 - 7);
      resolveMove(battle, correct(6, 3));
      expect(battle.charge).toBe(0);
    });

    it('is not affected by mistakes', () => {
      const battle = createBattle(ENEMY);
      advanceTime(battle, 10);
      resolveMove(battle, WRONG);
      expect(battle.charge).toBe(10);
    });

    it('can finish the player off and stops once the battle is over', () => {
      const battle = createBattle(ENEMY, 5);
      expect(advanceTime(battle, 20)).toMatchObject({ hpAfter: 0 });
      expect(battle.outcome).toBe('lost');
      expect(advanceTime(battle, 100)).toBeNull();
    });
  });
});
