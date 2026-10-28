import { describe, expect, it } from 'vitest';
import type { Unit } from '../sudoku/grid.ts';
import type { MoveResult } from '../sudoku/moves.ts';
import {
  advanceTime,
  createBattle,
  DAMAGE,
  moveDamage,
  moveKnockback,
  resolveMove,
  type EnemyDef,
} from './battle.ts';

const ENEMY: EnemyDef = { id: 'test', name: 'Test', maxHp: 100, attack: 10, attackEvery: 20, timedAttack: 5 };

function correct(units: number, solved = false): MoveResult {
  const completed: Unit[] = Array.from({ length: units }, (_, index) => ({ kind: 'row', index }));
  return { kind: 'correct', completed, solved };
}

const WRONG: MoveResult = { kind: 'wrong', expected: 1 };

describe('battle', () => {
  it('starts with full HP on both sides', () => {
    expect(createBattle(ENEMY, 30)).toMatchObject({ enemyHp: 100, playerHp: 30, outcome: 'ongoing' });
  });

  it('scales damage with completed units and rewards combos', () => {
    expect(moveDamage(0)).toBe(DAMAGE.cell);
    expect(moveDamage(1)).toBe(2 + 12);
    expect(moveDamage(2)).toBe(2 + 30);
    expect(moveDamage(3)).toBe(2 + 54);
  });

  it('hits the enemy for a correct digit', () => {
    const battle = createBattle(ENEMY);
    expect(resolveMove(battle, correct(2))).toEqual({
      target: 'enemy',
      cause: 'digit',
      damage: 32,
      units: 2,
      finisher: false,
      hpAfter: 68,
    });
    expect(battle.enemyHp).toBe(68);
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
    expect(resolveMove(battle, correct(3))).toBeNull();
  });

  it('is won when the enemy runs out of HP; damage never exceeds remaining HP', () => {
    const battle = createBattle({ ...ENEMY, maxHp: 40 });
    resolveMove(battle, correct(3));
    expect(battle.outcome).toBe('won');
    expect(battle.enemyHp).toBe(0);
  });

  it('treats solving the board as a finishing blow', () => {
    const battle = createBattle(ENEMY);
    expect(resolveMove(battle, correct(0, true))).toMatchObject({ damage: 100, finisher: true, hpAfter: 0 });
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
      resolveMove(battle, correct(1));
      expect(battle.charge).toBe(15 - 7);
      resolveMove(battle, correct(3));
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
