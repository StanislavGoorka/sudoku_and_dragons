import { describe, expect, it } from 'vitest';
import { createBattle, type EnemyDef } from '../../core/battle/battle.ts';
import type { MoveResult } from '../../core/sudoku/moves.ts';
import { createHero, heroMove, heroTime, parseHero, useSkill } from './hero.ts';

const enemy: EnemyDef = { id: 'test', name: 'Smok', maxHp: 100, attack: 7, attackEvery: 20, timedAttack: 6, pattern: 'heavy' };
const miss = { kind: 'wrong', expected: 4 } as const;
const correct: MoveResult = { kind: 'correct', digit: 4, completed: [], solved: false };
const box: MoveResult = { ...correct, completed: [{ kind: 'box', index: 0 }] };

describe('solo RPG combat', () => {
  it('preserves outgoing damage including the box multiplier and grants focus only for correct digits', () => {
    for (const id of ['guardian', 'ranger', 'alchemist'] as const) {
      const b = createBattle(enemy), h = createHero(id);
      heroMove(b, miss, h);
      expect(h.focus).toBe(0);
      expect(heroMove(b, correct, h)?.damage).toBe(4);
      expect(heroMove(b, box, h)?.damage).toBe(8);
      expect(h.focus).toBe(3);
      expect(useSkill(b, h)).toBeNull();
    }
  });

  it('uses raw damage before HP clipping and consumes a shield once, including on a lethal boss hit', () => {
    const b = createBattle(enemy), h = { ...createHero('guardian'), focus: 5 };
    b.playerHp = 3; b.timedAttacks = 2;
    expect(useSkill(b, h)).not.toBeNull();
    expect(heroTime(b, 20, h)).toMatchObject({ damage: 0, hpAfter: 3 });
    expect(h.guarded).toBe(false);
    expect(b.outcome).toBe('ongoing');
    expect(heroTime(b, 20, h)?.damage).toBe(3);
    expect(b.outcome).toBe('lost');
  });

  it('pushes back the ranger clock and consumes cover only on a mistake', () => {
    const b = createBattle(enemy), h = { ...createHero('ranger'), focus: 5 };
    b.charge = 16;
    heroMove(b, correct, h);
    expect(b.charge).toBe(13);
    expect(useSkill(b, h)).toMatchObject({ delayed: 10, healed: 0 });
    expect(b.charge).toBe(3);
    h.focus = 5;
    expect(useSkill(b, h)?.delayed).toBe(3);
    h.focus = 5;
    expect(useSkill(b, h)).toBeNull(); // No delay and the existing cover cannot stack.
    expect(heroTime(b, 20, h)?.damage).toBe(6);
    expect(h.guarded).toBe(true);
    expect(heroMove(b, miss, h)?.damage).toBe(4);
    expect(h.guarded).toBe(false);
  });

  it('heals with a completed unit and potion, capped at max HP and never after defeat', () => {
    const b = createBattle(enemy), h = { ...createHero('alchemist'), focus: 5 };
    expect(useSkill(b, h)).toBeNull();
    b.playerHp = 44;
    heroMove(b, box, h);
    expect(b.playerHp).toBe(45);
    expect(useSkill(b, h)?.healed).toBe(5);
    expect(b.playerHp).toBe(50);
    expect(h.focus).toBe(0);
    b.playerHp = 1;
    heroMove(b, miss, h);
    h.focus = 5;
    expect(useSkill(b, h)).toBeNull();
  });

  it('validates checkpoints and keeps unmodified combat for modes without a class', () => {
    expect(parseHero({ id: 'guardian', focus: 6, guarded: true })).toBeUndefined();
    expect(parseHero({ id: 'constructor', focus: 3, guarded: false })).toBeUndefined();
    expect(parseHero({ id: 'ranger', focus: 3, guarded: true })).toEqual({ id: 'ranger', focus: 3, guarded: true });
    expect(heroTime(createBattle(enemy), 20)?.damage).toBe(6);
  });
});
