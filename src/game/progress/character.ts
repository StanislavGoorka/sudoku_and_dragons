import { isHeroClass, type HeroClass } from '../../core/duel/classes.ts';
import type { Progress } from './progress.ts';

export interface Character { name: string; classId: HeroClass }
export function characterName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}\p{N} '-]{2,20}$/u.test(name) ? name : null;
}

export function parseCharacter(value: unknown): Character | null {
  const c = value as Partial<Character> | null;
  const name = characterName(c?.name);
  return name && isHeroClass(c?.classId) ? { name, classId: c.classId } : null;
}

/** Quest XP is derived from merged victories, so completing a chapter is never paid twice. */
export function questExperience(progress: Progress): number {
  return Object.values(progress.stages).reduce((xp, stage) => xp + (stage.wins ? 40 + (stage.wins - 1) * 10 : 0), 0);
}

export const storyLevel = (xp: number) => Math.floor(xp / 80) + 1;
export const STORY_HP_BONUS_LIMIT = 10;
export const storyHpBonus = (xp: number) => Math.min(STORY_HP_BONUS_LIMIT, storyLevel(xp) - 1);
export function storyTitle(level: number): string {
  return level >= 9 ? 'Smokobójca' : level >= 5 ? 'Obrońca krain' : level >= 3 ? 'Pogromca' : 'Nowicjusz';
}

const chapters = {
  valley: 'Smoki wypłoszyły ludzi z Zielonej Doliny. Odbij szlak i pokonaj przywódcę stada.',
  peaks: 'Popiół spada na osady. Wejdź na Ogniste Szczyty i powstrzymaj smoka przed kolejnym atakiem.',
  ruins: 'Pradawny smok przebudził się w ruinach. Dotrzyj do jego legowiska i zakończ zagrożenie.',
} as const;
export function chapterText(id: string): string { return chapters[id as keyof typeof chapters] ?? ''; }
