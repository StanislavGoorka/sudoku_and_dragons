import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../../core/index.ts';
import { currentStreak, DAILY_STARS, DAILY_STREAK_BONUS, dailyChallenge, dayKey, emptyDaily, previousDay, winDaily } from './daily.ts';
import { emptyProgress, mergeProgress, parseProgress, recordBattle, type BattleResult } from './progress.ts';

const ALL = ['easy', 'medium', 'hard'] as const;

describe('days', () => {
  it('are local calendar dates', () => {
    expect(dayKey(new Date(2026, 9, 30, 23, 59))).toBe('2026-10-30');
    expect(dayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('know the day before, across months and years', () => {
    expect(previousDay('2026-10-30')).toBe('2026-10-29');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });
});

describe('the daily board', () => {
  it('is the same all day and new the next day', () => {
    const morning = dailyChallenge(new Date(2026, 9, 30, 7), [...ALL]);
    const night = dailyChallenge(new Date(2026, 9, 30, 23), [...ALL]);
    const tomorrow = dailyChallenge(new Date(2026, 9, 31, 7), [...ALL]);
    expect(night).toEqual(morning);
    expect(tomorrow.seed).not.toBe(morning.seed);
  });

  it('rotates the level through the week, never above what the player has opened', () => {
    const week = Array.from({ length: 7 }, (_, i) => dailyChallenge(new Date(2026, 10, 1 + i), [...ALL]).difficulty);
    expect(new Set(week)).toEqual(new Set(ALL));
    for (let i = 0; i < 7; i++) {
      expect(dailyChallenge(new Date(2026, 10, 1 + i), ['easy']).difficulty).toBe('easy');
      expect(dailyChallenge(new Date(2026, 10, 1 + i), ['easy', 'medium']).difficulty).not.toBe('hard');
    }
  });

  it('makes a valid board', () => {
    const { seed, difficulty } = dailyChallenge(new Date(2026, 9, 30), [...ALL]);
    expect(generatePuzzle(seed, difficulty).givens).toHaveLength(81);
  });
});

describe('the streak', () => {
  it('grows on days in a row and pays a bonus, capped', () => {
    const record = emptyDaily();
    const paid: number[] = [];
    let day = '2026-10-01';
    for (let i = 0; i < 10; i++) {
      paid.push(winDaily(record, day)!.stars);
      day = dayKey(new Date(2026, 9, 2 + i));
    }
    expect(record.streak).toBe(10);
    expect(paid[0]).toBe(DAILY_STARS);
    expect(paid[1]).toBe(DAILY_STARS + 1);
    expect(paid[9]).toBe(DAILY_STARS + DAILY_STREAK_BONUS);
  });

  it('pays once a day', () => {
    const record = emptyDaily();
    expect(winDaily(record, '2026-10-30')).not.toBeNull();
    expect(winDaily(record, '2026-10-30')).toBeNull();
    expect(record.wins).toBe(1);
  });

  it('an older resumed challenge does not rewind a newer streak or pay the daily reward again', () => {
    const record = emptyDaily();
    winDaily(record, '2026-10-30');
    winDaily(record, '2026-10-31');
    const before = { ...record };
    expect(winDaily(record, '2026-10-30')).toBeNull();
    expect(record).toEqual(before);
  });

  it('breaks on a missed day but keeps the best', () => {
    const record = emptyDaily();
    winDaily(record, '2026-10-28');
    winDaily(record, '2026-10-29');
    expect(currentStreak(record, '2026-10-30')).toBe(2);
    expect(currentStreak(record, '2026-10-31')).toBe(0);
    expect(winDaily(record, '2026-10-31')).toEqual({ stars: DAILY_STARS, streak: 1 });
    expect(record.bestStreak).toBe(2);
  });
});

describe('the daily challenge in progress', () => {
  const win = (daily?: string): BattleResult => ({
    difficulty: 'easy',
    won: true,
    mistakes: 1,
    hpLeft: 30,
    maxHp: 50,
    seconds: 600,
    bestCombo: 1,
    daily,
  });

  it('a won daily battle pays its reward on top, and the first one unlocks an achievement', () => {
    const progress = emptyProgress();
    const reward = recordBattle(progress, win('2026-10-30'));
    expect(reward.daily).toEqual({ stars: DAILY_STARS, streak: 1 });
    expect(reward.achievements.map((a) => a.id)).toContain('daily');
    expect(recordBattle(progress, win('2026-10-30')).daily).toBeNull();
    expect(recordBattle(progress, win()).daily).toBeNull();
    expect(recordBattle(progress, { ...win('2026-10-31'), won: false }).daily).toBeNull();
  });

  it('survives a save and load, and old saves start with none', () => {
    const progress = emptyProgress();
    recordBattle(progress, win('2026-10-30'));
    expect(parseProgress(JSON.parse(JSON.stringify(progress))).daily).toEqual(progress.daily);
    expect(parseProgress({ stars: 3 }).daily).toEqual(emptyDaily());
    expect(parseProgress({ daily: { lastWon: 'yesterday', streak: 4 } }).daily).toEqual(emptyDaily());
  });

  it('merging keeps the streak of the later day and adds up wins', () => {
    const base = emptyProgress();
    const local = emptyProgress();
    const remote = emptyProgress();
    winDaily(local.daily, '2026-10-28');
    winDaily(remote.daily, '2026-10-29');
    winDaily(remote.daily, '2026-10-30');
    const merged = mergeProgress(base, local, remote);
    expect(merged.daily).toMatchObject({ lastWon: '2026-10-30', streak: 2, bestStreak: 2, wins: 3 });
  });
});
