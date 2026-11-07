import { expect, it } from 'vitest';
import { questExperience, storyHpBonus, storyLevel } from './character.ts';
import { emptyProgress, mergeProgress, parseProgress } from './progress.ts';

it('retains a named character across cloud reconciliation without repaying completed quests', () => {
  const base = emptyProgress();
  base.character = { name: 'Arin', classId: 'guardian' };
  base.stages['valley-1'] = { wins: 1, losses: 0, bestStars: 2, bestTime: 120 };
  const local = structuredClone(base), remote = structuredClone(base);
  remote.stages['valley-2'] = { ...base.stages['valley-1'] };
  local.character = { ...base.character, classId: 'ranger' };
  const merged = mergeProgress(base, local, remote);
  expect(merged.character).toEqual({ name: 'Arin', classId: 'ranger' });
  expect(questExperience(merged)).toBe(80);
  expect(storyLevel(80)).toBe(2);
  expect(storyHpBonus(80)).toBe(1);
  expect(storyHpBonus(100000)).toBe(10);
  expect(parseProgress({ character: { name: ' ', classId: 'unknown' } }).character).toBeNull();
});
