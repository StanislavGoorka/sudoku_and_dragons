import { describe, expect, it } from 'vitest';
import { boardTheme, DEFAULT_BOARD_THEME } from '../boardThemes.ts';
import {
  ACHIEVEMENTS,
  buyTheme,
  chooseTheme,
  chosenTheme,
  DUEL_WIN_STARS,
  emptyProgress,
  ownsTheme,
  isUnlocked,
  parseProgress,
  recordBattle,
  recordDuel,
  type BattleResult,
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

describe('board themes', () => {
  const ocean = boardTheme('ocean');

  it('everyone owns the free theme and starts with it', () => {
    const progress = emptyProgress();
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    expect(ownsTheme(progress, boardTheme(DEFAULT_BOARD_THEME))).toBe(true);
    expect(ownsTheme(progress, ocean)).toBe(false);
  });

  it('buying takes the stars, keeps the theme and puts it on', () => {
    const progress = emptyProgress();
    progress.stars = ocean.price - 1;
    expect(buyTheme(progress, ocean)).toBe('too-few-stars');
    expect(progress.stars).toBe(ocean.price - 1);
    progress.stars = ocean.price + 3;
    progress.starsEarned = progress.stars;
    expect(buyTheme(progress, ocean)).toBe('bought');
    expect(progress.stars).toBe(3);
    // Spending never lowers what was earned.
    expect(progress.starsEarned).toBe(ocean.price + 3);
    expect(chosenTheme(progress).id).toBe('ocean');
    expect(buyTheme(progress, ocean)).toBe('owned');
    expect(progress.stars).toBe(3);
  });

  it('only owned themes can be put on', () => {
    const progress = emptyProgress();
    expect(chooseTheme(progress, ocean)).toBe(false);
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    progress.stars = 100;
    buyTheme(progress, ocean);
    expect(chooseTheme(progress, boardTheme(DEFAULT_BOARD_THEME))).toBe(true);
    expect(chosenTheme(progress).id).toBe(DEFAULT_BOARD_THEME);
    expect(chooseTheme(progress, ocean)).toBe(true);
    expect(chosenTheme(progress).id).toBe('ocean');
  });
});

describe('saved data', () => {
  it('survives a save and load', () => {
    const progress = emptyProgress();
    recordBattle(progress, win({ mistakes: 0 }));
    recordDuel(progress, true);
    progress.stars += 50;
    progress.starsEarned += 50;
    buyTheme(progress, boardTheme('meadow'));
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
});
