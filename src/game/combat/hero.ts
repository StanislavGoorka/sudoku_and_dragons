import { advanceTime, nextTimedDamage, resolveMove, type Battle, type Hit } from '../../core/battle/battle.ts';
import type { MoveResult } from '../../core/sudoku/moves.ts';

export const HERO_CLASSES = {
  guardian: {
    name: 'Strażnik', skill: 'Bastion', color: 0x75baff,
    passive: 'Pancerz: ataki czasowe smoka zadają o 2 HP mniej (minimum 1).',
    active: 'Bastion: osłona pochłania do 6 HP z najbliższego ciosu smoka, także po błędnej cyfrze.',
  },
  ranger: {
    name: 'Zwiadowca', skill: 'Zasłona', color: 0x8ce5ab,
    passive: 'Szybkość: poprawna cyfra cofa ładowanie ataku o dodatkową sekundę.',
    active: 'Zasłona: cofa ładowanie o maks. 10 s i osłabia cios za następny błąd o 3 HP.',
  },
  alchemist: {
    name: 'Alchemik', skill: 'Eliksir', color: 0xf1b1ff,
    passive: 'Regeneracja: domknięcie wiersza, kolumny lub kwadratu odzyskuje 1 HP na ruch.',
    active: 'Eliksir: odzyskujesz do 8 HP. Można go wypić, gdy brakuje Ci zdrowia.',
  },
} as const;

export type HeroClass = keyof typeof HERO_CLASSES;
export const HERO_IDS = Object.keys(HERO_CLASSES) as HeroClass[];
export const FOCUS_COST = 5;

export interface HeroState { id: HeroClass; focus: number; guarded: boolean }
export interface SkillUse { id: HeroClass; healed: number; delayed: number }

export function isHeroClass(value: unknown): value is HeroClass {
  return typeof value === 'string' && Object.hasOwn(HERO_CLASSES, value);
}

export function parseHero(value: unknown): HeroState | undefined {
  const h = value as HeroState | undefined;
  if (!h || !isHeroClass(h.id) || !Number.isInteger(h.focus) || h.focus < 0 || h.focus > FOCUS_COST ||
      typeof h.guarded !== 'boolean' || (h.id === 'alchemist' && h.guarded)) return undefined;
  return { id: h.id, focus: h.focus, guarded: h.guarded };
}

export function createHero(id: HeroClass): HeroState { return { id, focus: 0, guarded: false }; }

function heal(battle: Battle, amount: number): number {
  const recovered = Math.min(amount, battle.playerMaxHp - battle.playerHp);
  battle.playerHp += recovered;
  return recovered;
}

export function canUseSkill(battle: Battle, hero: HeroState): boolean {
  if (battle.outcome !== 'ongoing' || hero.focus < FOCUS_COST) return false;
  if (hero.id === 'alchemist') return battle.playerHp < battle.playerMaxHp;
  if (hero.id === 'ranger') return !hero.guarded || battle.charge >= 1;
  return !hero.guarded;
}

export function useSkill(battle: Battle, hero: HeroState): SkillUse | null {
  if (!canUseSkill(battle, hero)) return null;
  hero.focus -= FOCUS_COST;
  let healed = 0, delayed = 0;
  if (hero.id === 'alchemist') healed = heal(battle, 8);
  else {
    hero.guarded = true;
    if (hero.id === 'ranger') {
      delayed = Math.min(10, battle.charge);
      battle.charge -= delayed;
    }
  }
  return { id: hero.id, healed, delayed };
}

/** Mitigate the raw incoming hit before capping it at remaining HP. A shield can prevent a KO. */
function defend(battle: Battle, hero: HeroState, hit: Hit, raw: number, hpBefore: number): Hit {
  let damage = raw;
  if (hero.id === 'guardian' && hit.cause === 'timer') damage = Math.max(1, damage - 2);
  if (hero.guarded && (hero.id === 'guardian' || (hero.id === 'ranger' && hit.cause === 'mistake'))) {
    damage = Math.max(0, damage - (hero.id === 'guardian' ? 6 : 3));
    hero.guarded = false;
  }
  const dealt = Math.min(hpBefore, damage);
  battle.playerHp = hpBefore - dealt;
  battle.outcome = battle.playerHp > 0 ? 'ongoing' : 'lost';
  return { ...hit, damage: dealt, hpAfter: battle.playerHp };
}

/** Only solo RPG modes call these wrappers; shared rules and the ranked referee remain untouched. */
export function heroMove(battle: Battle, move: MoveResult, hero?: HeroState): Hit | null {
  const hp = battle.playerHp;
  const hit = resolveMove(battle, move);
  if (!hero || !hit) return hit;
  if (hit.cause === 'mistake') return defend(battle, hero, hit, battle.enemy.attack, hp);
  hero.focus = Math.min(FOCUS_COST, hero.focus + 1 + (hit.units > 0 ? 1 : 0));
  if (hero.id === 'ranger') battle.charge = Math.max(0, battle.charge - 1);
  if (hero.id === 'alchemist' && hit.units > 0) heal(battle, 1);
  return hit;
}

export function heroTime(battle: Battle, seconds: number, hero?: HeroState): Hit | null {
  if (!hero) return advanceTime(battle, seconds);
  const hp = battle.playerHp, raw = nextTimedDamage(battle);
  const hit = advanceTime(battle, seconds);
  return hit && defend(battle, hero, hit, raw, hp);
}
