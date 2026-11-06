import { profileSuffix } from '../profile.ts';
import { isHeroClass, type HeroClass } from './hero.ts';

const key = `sudoku-dragons.hero${profileSuffix}`;
let selection: HeroClass | undefined;

export function chosenHero(): HeroClass {
  if (selection) return selection;
  try {
    const saved = localStorage.getItem(key);
    if (isHeroClass(saved)) return selection = saved;
  } catch { /* Play with the default if device storage is unavailable. */ }
  return selection = 'guardian';
}

export function chooseHero(id: HeroClass): void {
  selection = id;
  try { localStorage.setItem(key, id); } catch { /* Selection still applies for this session. */ }
}
