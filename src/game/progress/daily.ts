import type { Difficulty } from '../../core/index.ts';

/**
 * The daily challenge: one board a day, the same for every player at the same level (its seed comes
 * from the date), won once for a reward that grows with the streak of days in a row. Days follow the
 * player's own calendar, so a new challenge comes at their midnight.
 */

/** Stars for the day's first win, before the streak bonus. */
export const DAILY_STARS = 5;
/** The streak adds a star a day on top, up to this many. */
export const DAILY_STREAK_BONUS = 5;

/** By day of the week (Sunday first): the level the challenge is on, if the player has opened it. */
const ROTATION: Difficulty[] = ['hard', 'easy', 'medium', 'hard', 'easy', 'medium', 'hard'];

/** A day as 'YYYY-MM-DD' in local time. */
export function dayKey(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function previousDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day - 1));
}

/** FNV-1a: a 32-bit hash, the same on every device. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export interface DailyChallenge {
  key: string;
  difficulty: Difficulty;
  seed: number;
}

/**
 * Today's challenge for a player who has opened the levels in `open` (in order): the day's level from
 * the rotation, or the hardest open one if that is not open yet.
 */
export function dailyChallenge(date: Date, open: Difficulty[]): DailyChallenge {
  const key = dayKey(date);
  const wanted = ROTATION[date.getDay()];
  const difficulty = open.includes(wanted) ? wanted : open[open.length - 1];
  return { key, difficulty, seed: hash(`${key}:${difficulty}`) };
}

export interface DailyRecord {
  /** The last day whose challenge was won ('YYYY-MM-DD'), or null. */
  lastWon: string | null;
  /** Days in a row won up to `lastWon`. */
  streak: number;
  bestStreak: number;
  wins: number;
}

export function emptyDaily(): DailyRecord {
  return { lastWon: null, streak: 0, bestStreak: 0, wins: 0 };
}

/** The streak as it stands on `today`: it lives on until a day is missed. */
export function currentStreak(record: DailyRecord, today: string): number {
  return record.lastWon === today || record.lastWon === previousDay(today) ? record.streak : 0;
}

/** Stars the day's first win would pay now. */
export function dailyReward(record: DailyRecord, today: string): number {
  const streak = currentStreak(record, today) + 1;
  return DAILY_STARS + Math.min(streak - 1, DAILY_STREAK_BONUS);
}

/** Records a won challenge. Returns the stars it pays and the streak, or null if today was already won. */
export function winDaily(record: DailyRecord, today: string): { stars: number; streak: number } | null {
  if (record.lastWon === today) return null;
  const stars = dailyReward(record, today);
  record.streak = currentStreak(record, today) + 1;
  record.lastWon = today;
  record.bestStreak = Math.max(record.bestStreak, record.streak);
  record.wins++;
  return { stars, streak: record.streak };
}
