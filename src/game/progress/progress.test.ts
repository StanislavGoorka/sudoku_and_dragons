import { describe, expect, it } from 'vitest';
import { boardTheme, DEFAULT_BOARD_THEME } from '../boardThemes.ts';
import { DEFAULT_DRAGON_SKIN, dragonSkin } from '../dragonSkins.ts';
import { DEFAULT_HIT_EFFECT, hitEffect } from '../hitEffects.ts';
import {
  ACHIEVEMENTS,
  buy,
  canBuyNew,
  choose,
  chosenEffect,
  chosenSkin,
  chosenTheme,
  DUEL_WIN_STARS,
  emptyProgress,
  isUnlocked,
  mergeProgress,
  owns,
  parseProgress,
  recordBattle,
  recordDuel,
  sameProgress,
  type BattleResult,
  type Progress,
} from './progress.ts';

const win = (overrides: Partial<BattleResult> = {}): BattleResult => ({
  difficulty: 'easy',
  won: true,
  mistakes: 1,
  hpLeft: 30,
  maxHp: 50,
  seconds: 600,
  bestCombo: 1,
  ...overrides,
});
const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('battle stars', () => {
  it('a plain win is one star, flawless and healthy add one each', () => {
    expect(recordBattle(emptyProgress(), win()).stars).toBe(1);
    expect(recordBattle(emptyProgress(), win({ mistakes: 0 })).stars).toBe(2);
    expect(recordBattle(emptyProgress(), win({ mistakes: 0, hpLeft: 40 })).stars).toBe(3);
    expect(recordBattle(emptyProgress(), win({ mistakes: 2, hpLeft: 45 })).stars).toBe(2);
  });

  it('a lost battle gives nothing but is counted', () => {
    const progress = emptyProgress();
    const reward = recordBattle(progress, win({ won: false, hpLeft: 0, mistakes: 0 }));
    expect(reward.stars).toBe(0);
    expect(reward.goals.every((goal) => !goal.met)).toBe(true);
    expect(progress.levels.easy).toMatchObject({ wins: 0, losses: 1 });
    expect(progress.stars).toBe(0);
  });

  it('stars add up as currency and each level keeps its best', () => {
    const progress = emptyProgress();
    recordBattle(progress, win({ mistakes: 0, hpLeft: 50, seconds: 500 }));
    recordBattle(progress, win({ seconds: 700 }));
    expect(progress.levels.easy).toMatchObject({ wins: 2, bestStars: 3, bestTime: 500 });
    // 3 + 1 for the battles, plus the achievements they unlocked.
    const fromAchievements = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).reduce((sum, a) => sum + a.reward, 0);
    expect(progress.stars).toBe(4 + fromAchievements);
    expect(progress.starsEarned).toBe(progress.stars);
  });
});

describe('unlocking dragons', () => {
  it('only the young dragon is open at first; each win opens the next', () => {
    const progress = emptyProgress();
    expect([isUnlocked(progress, 'easy'), isUnlocked(progress, 'medium'), isUnlocked(progress, 'hard')]).toEqual([true, false, false]);
    expect(recordBattle(progress, win({ won: false })).unlocked).toBeNull();
    expect(recordBattle(progress, win()).unlocked).toBe('medium');
    expect(recordBattle(progress, win()).unlocked).toBeNull();
    expect(recordBattle(progress, win({ difficulty: 'medium' })).unlocked).toBe('hard');
    expect(isUnlocked(progress, 'hard')).toBe(true);
  });
});

describe('achievements', () => {
  it('unlock once, pay their stars, and come back with the reward', () => {
    const progress = emptyProgress();
    const first = recordBattle(progress, win({ mistakes: 0, bestCombo: 2 }), 1000);
    expect(ids(first.achievements)).toEqual(['first-win', 'flawless', 'combo']);
    expect(progress.achievements['first-win']).toBe(1000);
    expect(progress.stars).toBe(2 + 5 + 5 + 5);
    expect(ids(recordBattle(progress, win({ mistakes: 0, bestCombo: 2 })).achievements)).toEqual([]);
  });

  it('a combo counts even in a lost battle', () => {
    const progress = emptyProgress();
    expect(ids(recordBattle(progress, win({ won: false, bestCombo: 3 })).achievements)).toEqual(['combo', 'triple-combo']);
  });

  it('beating all three dragons and quick wins', () => {
    const progress = emptyProgress();
    recordBattle(progress, win({ seconds: 299 }));
    recordBattle(progress, win({ difficulty: 'medium' }));
    const last = recordBattle(progress, win({ difficulty: 'hard' }));
    expect(ids(last.achievements)).toContain('dragon-slayer');
    expect(progress.achievements.lightning).toBeDefined();
  });

  it('duels pay stars for wins and count towards their achievements', () => {
    const progress = emptyProgress();
    expect(recordDuel(progress, false).stars).toBe(0);
    const won = recordDuel(progress, true);
    expect(won.stars).toBe(DUEL_WIN_STARS);
    expect(ids(won.achievements)).toEqual(['duelist']);
    expect(progress.duels).toEqual({ played: 2, won: 1 });
  });

  it('every achievement has a reachable goal', () => {
    for (const achievement of ACHIEVEMENTS) {
      const [current, target] = achievement.progress(emptyProgress());
      expect(current).toBe(0);
      expect(target).toBeGreaterThan(0);
    }
    expect(new Set(ids(ACHIEVEMENTS)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('cosmetics', () => {
  const ocean = boardTheme('ocean');
  const frost = dragonSkin('frost');

  it('everyone owns the free theme and skin and starts with them', () => {
    const progress = emptyProgress();
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    expect(chosenSkin(progress).id).toBe(DEFAULT_DRAGON_SKIN);
    expect(owns(progress, 'board', boardTheme(DEFAULT_BOARD_THEME))).toBe(true);
    expect(owns(progress, 'dragon', dragonSkin(DEFAULT_DRAGON_SKIN))).toBe(true);
    expect(owns(progress, 'board', ocean)).toBe(false);
    expect(owns(progress, 'dragon', frost)).toBe(false);
  });

  it('buying takes the stars, keeps the theme and puts it on', () => {
    const progress = emptyProgress();
    progress.stars = ocean.price - 1;
    expect(buy(progress, 'board', ocean)).toBe('too-few-stars');
    expect(progress.stars).toBe(ocean.price - 1);
    progress.stars = ocean.price + 3;
    progress.starsEarned = progress.stars;
    expect(buy(progress, 'board', ocean)).toBe('bought');
    expect(progress.stars).toBe(3);
    // Spending never lowers what was earned.
    expect(progress.starsEarned).toBe(ocean.price + 3);
    expect(chosenTheme(progress).id).toBe('ocean');
    expect(buy(progress, 'board', ocean)).toBe('owned');
    expect(progress.stars).toBe(3);
  });

  it('only owned themes can be put on', () => {
    const progress = emptyProgress();
    expect(choose(progress, 'board', ocean)).toBe(false);
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    progress.stars = 100;
    buy(progress, 'board', ocean);
    expect(choose(progress, 'board', boardTheme(DEFAULT_BOARD_THEME))).toBe(true);
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    expect(choose(progress, 'board', ocean)).toBe(true);
    expect(chosenTheme(progress).id).toBe('ocean');
  });

  it('a dragon skin is bought and worn apart from the board theme', () => {
    const progress = emptyProgress();
    progress.stars = frost.price;
    expect(buy(progress, 'dragon', frost)).toBe('bought');
    expect(progress.stars).toBe(0);
    expect(chosenSkin(progress).id).toBe('frost');
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    expect(owns(progress, 'board', ocean)).toBe(false);
    expect(choose(progress, 'dragon', dragonSkin(DEFAULT_DRAGON_SKIN))).toBe(true);
    expect(chosenSkin(progress).id).toBe(DEFAULT_DRAGON_SKIN);
  });

  it('knows when the stars buy something new', () => {
    const progress = emptyProgress();
    expect(canBuyNew(progress)).toBe(false);
    progress.stars = Math.min(ocean.price, frost.price);
    expect(canBuyNew(progress)).toBe(true);
    progress.stars = dragonSkin('emerald').price;
    expect(canBuyNew(progress, 'dragon')).toBe(true);
    expect(canBuyNew(progress, 'board')).toBe(true);
    progress.stars = 15;
    expect(canBuyNew(progress, 'board')).toBe(true);
    expect(canBuyNew(progress, 'dragon')).toBe(false);
    expect(canBuyNew(progress, 'effect')).toBe(true);
  });

  it('a hit effect is bought and used apart from the rest', () => {
    const progress = emptyProgress();
    expect(chosenEffect(progress).id).toBe(DEFAULT_HIT_EFFECT);
    const fire = hitEffect('fire');
    progress.stars = fire.price;
    expect(buy(progress, 'effect', fire)).toBe('bought');
    expect(chosenEffect(progress).id).toBe('fire');
    expect(chosenSkin(progress).id).toBe(DEFAULT_DRAGON_SKIN);
    expect(choose(progress, 'effect', hitEffect('meteor'))).toBe(false);
    expect(choose(progress, 'effect', hitEffect(DEFAULT_HIT_EFFECT))).toBe(true);
  });
});

describe('saved data', () => {
  it('survives a save and load', () => {
    const progress = emptyProgress();
    recordBattle(progress, win({ mistakes: 0 }));
    recordDuel(progress, true);
    progress.stars += 50;
    progress.starsEarned += 50;
    buy(progress, 'board', boardTheme('meadow'));
    buy(progress, 'dragon', dragonSkin('emerald'));
    buy(progress, 'effect', hitEffect('stars'));
    expect(parseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
  });

  it('broken or foreign data falls back to a fresh start, field by field', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('nonsense')).toEqual(emptyProgress());
    const parsed = parseProgress({ stars: -4, levels: { easy: { wins: 3, bestStars: 9 } }, achievements: { gone: 1, combo: 5 } });
    expect(parsed.stars).toBe(0);
    expect(parsed.levels.easy).toEqual({ wins: 3, losses: 0, bestStars: 3, bestTime: null });
    expect(parsed.achievements).toEqual({ combo: 5 });
  });

  it('keeps only known bought themes, and a chosen theme only if owned', () => {
    expect(parseProgress({ boardThemes: ['ocean', 'gone', 'violet', 'ocean'], boardTheme: 'ocean' })).toMatchObject({
      boardThemes: ['ocean'],
      boardTheme: 'ocean',
    });
    expect(parseProgress({ boardThemes: [], boardTheme: 'night' }).boardTheme).toBe(DEFAULT_BOARD_THEME);
    expect(parseProgress({ boardThemes: 'ocean', boardTheme: 'gone' })).toMatchObject({ boardThemes: [], boardTheme: DEFAULT_BOARD_THEME });
  });

  it('keeps only known bought skins, and a chosen skin only if owned', () => {
    expect(parseProgress({ dragonSkins: ['king', 'gone', 'azure'], dragonSkin: 'king' })).toMatchObject({
      dragonSkins: ['king'],
      dragonSkin: 'king',
    });
    expect(parseProgress({ dragonSkin: 'magma' }).dragonSkin).toBe(DEFAULT_DRAGON_SKIN);
    // Saves from before skins existed.
    expect(parseProgress({ stars: 3 })).toMatchObject({ dragonSkins: [], dragonSkin: DEFAULT_DRAGON_SKIN });
  });

  it('keeps only known bought hit effects, and a chosen one only if owned', () => {
    expect(parseProgress({ hitEffects: ['fire', 'gone'], hitEffect: 'fire' })).toMatchObject({ hitEffects: ['fire'], hitEffect: 'fire' });
    expect(parseProgress({ hitEffect: 'rainbow' }).hitEffect).toBe(DEFAULT_HIT_EFFECT);
    expect(parseProgress({ stars: 3 })).toMatchObject({ hitEffects: [], hitEffect: DEFAULT_HIT_EFFECT });
  });
});

describe('merging two copies', () => {
  const copy = (p: Progress) => parseProgress(JSON.parse(JSON.stringify(p)));
  const rich = () => {
    const p = emptyProgress();
    p.stars = p.starsEarned = 100;
    return p;
  };

  it('adds up what each side gained since the base', () => {
    const base = rich();
    recordBattle(base, win());
    const local = copy(base);
    const remote = copy(base);
    recordBattle(local, win({ seconds: 400 }));
    recordBattle(remote, win({ difficulty: 'medium', won: false }));
    recordDuel(remote, true);
    const merged = mergeProgress(base, local, remote);
    expect(merged.levels.easy).toMatchObject({ wins: 2, bestTime: 400 });
    expect(merged.levels.medium).toMatchObject({ wins: 0, losses: 1 });
    expect(merged.duels).toEqual({ played: 1, won: 1 });
    expect(merged.stars).toBe(local.stars + remote.stars - base.stars);
    expect(merged.starsEarned).toBe(local.starsEarned + remote.starsEarned - base.starsEarned);
  });

  it('with nothing changed on one side, it is the other side', () => {
    const base = rich();
    const local = copy(base);
    recordBattle(local, win({ mistakes: 0 }));
    buy(local, 'board', boardTheme('ocean'));
    expect(sameProgress(mergeProgress(base, local, copy(base)), local)).toBe(true);
    expect(sameProgress(mergeProgress(base, copy(base), local), local)).toBe(true);
  });

  it('adds a guest to an account when the base is empty', () => {
    const guest = emptyProgress();
    recordBattle(guest, win());
    const account = rich();
    buy(account, 'dragon', dragonSkin('king'));
    const merged = mergeProgress(emptyProgress(), guest, account);
    expect(merged.levels.easy.wins).toBe(1);
    expect(merged.stars).toBe(guest.stars + account.stars);
    expect(merged.dragonSkins).toEqual(['king']);
    // The guest never picked a skin, so the account's stays on.
    expect(merged.dragonSkin).toBe('king');
  });

  it('counts a theme bought or an achievement unlocked on both sides once', () => {
    const base = rich();
    const local = copy(base);
    const remote = copy(base);
    for (const p of [local, remote]) {
      buy(p, 'board', boardTheme('ocean'));
      recordBattle(p, win());
    }
    const merged = mergeProgress(base, local, remote);
    expect(merged.boardThemes).toEqual(['ocean']);
    // Two battles' worth of stars, one ocean bought, each achievement paid once.
    const battle = recordBattle(emptyProgress(), win()).stars;
    const achievements = ACHIEVEMENTS.filter((a) => merged.achievements[a.id] !== undefined).reduce((sum, a) => sum + a.reward, 0);
    expect(merged.stars).toBe(100 + battle * 2 - boardTheme('ocean').price + achievements);
  });

  it('keeps the look this device chose, else the other one', () => {
    const base = rich();
    buy(base, 'board', boardTheme('ocean'));
    buy(base, 'board', boardTheme('meadow'));
    const local = copy(base);
    const remote = copy(base);
    choose(remote, 'board', boardTheme('ocean'));
    expect(mergeProgress(base, local, remote).boardTheme).toBe('ocean');
    choose(local, 'board', boardTheme(DEFAULT_BOARD_THEME));
    expect(mergeProgress(base, local, remote).boardTheme).toBe(DEFAULT_BOARD_THEME);
  });

  it('never goes below zero stars', () => {
    const base = rich();
    const local = copy(base);
    const remote = copy(base);
    buy(local, 'dragon', dragonSkin('king'));
    buy(remote, 'board', boardTheme('treasure'));
    expect(mergeProgress(base, local, remote).stars).toBe(0);
  });
});

describe('comparing', () => {
  it('ignores the order things were bought in', () => {
    const a = emptyProgress();
    a.stars = a.starsEarned = 200;
    const b = parseProgress(JSON.parse(JSON.stringify(a)));
    buy(a, 'board', boardTheme('ocean'));
    buy(a, 'board', boardTheme('meadow'));
    buy(b, 'board', boardTheme('meadow'));
    buy(b, 'board', boardTheme('ocean'));
    b.boardTheme = 'meadow';
    a.boardTheme = 'meadow';
    expect(sameProgress(a, b)).toBe(true);
    b.stars++;
    expect(sameProgress(a, b)).toBe(false);
  });
});
