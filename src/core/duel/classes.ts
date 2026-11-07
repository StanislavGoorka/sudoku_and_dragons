export const CLASS_IDS = ['guardian', 'ranger', 'alchemist'] as const;
export type HeroClass = typeof CLASS_IDS[number];
export function isHeroClass(value: unknown): value is HeroClass { return CLASS_IDS.some(id => id === value); }
export const ARENA_FOCUS = 5;
export const arenaLevel = (xp: number) => 1 + Math.floor(xp / 100);
export const arenaMaxHp = (xp: number) => 130 + Math.min(20, 2 * (arenaLevel(xp) - 1));

export interface ArenaFighter {
  id: HeroClass;
  maxHp: number;
  level: number;
  focus: number;
  guarded: boolean;
  correct: number;
}

export function arenaFighter(id: HeroClass, xp = 0): ArenaFighter {
  return { id, maxHp: arenaMaxHp(xp), level: arenaLevel(xp), focus: 0, guarded: false, correct: 0 };
}
