import { expect, it } from 'vitest';
import { arenaFighter } from './classes.ts';
import { createDuel, playDuelMove, useArenaSkill } from './duel.ts';

const givens = Array<number>(81).fill(0);
const solution = Array<number>(81).fill(4);

it('Arena levels grant bounded HP and class skill does not consume a Sudoku move', () => {
  const s = createDuel(givens, 0, [arenaFighter('alchemist', 300), arenaFighter('ranger', 5000)]);
  expect(s.hp).toEqual([136, 150]);
  s.hp[0] = 120;
  s.heroes![0].focus = 5;
  expect(useArenaSkill(s, 1).ok).toBe(false);
  expect(useArenaSkill(s, 0)).toEqual({ ok: true, event: { kind: 'skill', seat: 0, id: 'alchemist', healed: 8 } });
  expect(s.hp).toEqual([128, 150]);
  expect(s.board).toEqual(givens);
  expect(s.movesLeft).toBe(3);
  expect(useArenaSkill(s, 0).ok).toBe(false);
});

it('Bastion mitigates the next hit only, and a ranger earns more focus without changing damage', () => {
  const s = createDuel(givens, 0, [arenaFighter('guardian'), arenaFighter('ranger')]);
  s.heroes![0].focus = 5;
  useArenaSkill(s, 0);
  expect(playDuelMove(s, solution, 0, 1, 9)).toMatchObject({ event: { damage: 8 } });
  expect(playDuelMove(s, solution, 1, 1, 4)).toMatchObject({ event: { damage: 0 } });
  expect(s.heroes![0].guarded).toBe(false);
  expect(playDuelMove(s, solution, 1, 2, 4)).toMatchObject({ event: { damage: 4 } });
  expect(s.heroes![1].focus).toBe(4);
  expect(s.heroes![1].correct).toBe(2);
});
