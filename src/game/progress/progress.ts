import type { Difficulty } from '../../core/index.ts';
import { BOARD_THEMES, boardTheme, DEFAULT_BOARD_THEME, type BoardTheme } from '../boardThemes.ts';

/** The solo levels in the order they unlock. */
export const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];

export interface LevelRecord {
  wins: number;
  losses: number;
  /** Most stars won in one battle on this level (0–3). */
  bestStars: number;
  /** Fastest win, in seconds. */
  bestTime: number | null;
}

/** Everything the player has achieved; saved on the device (see store.ts). */
export interface Progress {
  /** Stars to spend: the currency. */
  stars: number;
  /** Every star ever earned, spent or not. */
  starsEarned: number;
  levels: Record<Difficulty, LevelRecord>;
  duels: { played: number; won: number };
  /** Battles won without a single mistake. */
  flawlessWins: number;
  /** Most rows, columns and boxes completed with one digit. */
  bestCombo: number;
  /** Unlocked achievements: id → when (ms since epoch). */
  achievements: Record<string, number>;
  /** Board themes bought (the free one is not listed). */
  boardThemes: string[];
  /** The board theme in use. */
  boardTheme: string;
}

export function emptyProgress(): Progress {
  const level = (): LevelRecord => ({ wins: 0, losses: 0, bestStars: 0, bestTime: null });
  return {
    stars: 0,
    starsEarned: 0,
    levels: { easy: level(), medium: level(), hard: level() },
    duels: { played: 0, won: 0 },
    flawlessWins: 0,
    bestCombo: 0,
    achievements: {},
    boardThemes: [],
    boardTheme: DEFAULT_BOARD_THEME,
  };
}

/** Saved data of any age or shape, made whole: unknown fields are dropped, missing ones filled in. */
export function parseProgress(data: unknown): Progress {
  const progress = emptyProgress();
  if (typeof data !== 'object' || data === null) return progress;
  const saved = data as Partial<Progress>;
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  progress.stars = count(saved.stars);
  progress.starsEarned = Math.max(count(saved.starsEarned), progress.stars);
  for (const difficulty of LEVELS) {
    const level = saved.levels?.[difficulty];
    if (!level) continue;
    progress.levels[difficulty] = {
      wins: count(level.wins),
      losses: count(level.losses),
      bestStars: Math.min(3, count(level.bestStars)),
      bestTime: typeof level.bestTime === 'number' && level.bestTime > 0 ? level.bestTime : null,
    };
  }
  progress.duels = { played: count(saved.duels?.played), won: count(saved.duels?.won) };
  progress.flawlessWins = count(saved.flawlessWins);
  progress.bestCombo = count(saved.bestCombo);
  for (const [id, at] of Object.entries(saved.achievements ?? {})) {
    if (ACHIEVEMENTS.some((achievement) => achievement.id === id)) progress.achievements[id] = count(at);
  }
  const bought = Array.isArray(saved.boardThemes) ? saved.boardThemes : [];
  progress.boardThemes = BOARD_THEMES.filter((theme) => theme.price > 0 && bought.includes(theme.id)).map((theme) => theme.id);
  const chosen = BOARD_THEMES.find((theme) => theme.id === saved.boardTheme);
  if (chosen && ownsTheme(progress, chosen)) progress.boardTheme = chosen.id;
  return progress;
}

/** A level is open once the one before it has been won. */
export function isUnlocked(progress: Progress, difficulty: Difficulty): boolean {
  const index = LEVELS.indexOf(difficulty);
  return index <= 0 || progress.levels[LEVELS[index - 1]].wins > 0;
}

export interface BattleResult {
  difficulty: Difficulty;
  won: boolean;
  mistakes: number;
  hpLeft: number;
  maxHp: number;
  seconds: number;
  /** Most units completed with one digit in this battle. */
  bestCombo: number;
}

/** The share of HP to keep for the third star: the dragon's timed attacks take it from slow players. */
export const HP_GOAL = 0.8;

export interface StarGoal {
  /** Short, for under the star. */
  label: string;
  met: boolean;
}

/** The three stars a battle can give: win, win without mistakes, win with most of your HP. */
export function battleStars(result: BattleResult): StarGoal[] {
  const { won } = result;
  return [
    { label: 'Wygrana', met: won },
    { label: 'Bez błędów', met: won && result.mistakes === 0 },
    { label: `${Math.round(HP_GOAL * 100)}% zdrowia`, met: won && result.hpLeft >= result.maxHp * HP_GOAL },
  ];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Stars paid when it unlocks. */
  reward: number;
  /** How far the player is: [current, target]; done when current reaches target. */
  progress(p: Progress): [number, number];
}

const totalWins = (p: Progress) => LEVELS.reduce((sum, d) => sum + p.levels[d].wins, 0);
const fastestWin = (p: Progress) =>
  Math.min(...LEVELS.map((d) => p.levels[d].bestTime ?? Infinity));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', title: 'Pierwsze zwycięstwo', description: 'Pokonaj dowolnego smoka.', reward: 5, progress: (p) => [Math.min(1, totalWins(p)), 1] },
  { id: 'flawless', title: 'Bez skazy', description: 'Wygraj walkę bez ani jednego błędu.', reward: 5, progress: (p) => [Math.min(1, p.flawlessWins), 1] },
  { id: 'combo', title: 'Combo!', description: 'Ukończ dwie linie jednym ruchem.', reward: 5, progress: (p) => [Math.min(2, p.bestCombo), 2] },
  { id: 'triple-combo', title: 'Potrójne combo', description: 'Ukończ trzy linie jednym ruchem.', reward: 10, progress: (p) => [Math.min(3, p.bestCombo), 3] },
  {
    id: 'three-stars',
    title: 'Trzy gwiazdki',
    description: 'Zdobądź wszystkie trzy gwiazdki w jednej walce.',
    reward: 10,
    progress: (p) => [Math.max(...LEVELS.map((d) => p.levels[d].bestStars)), 3],
  },
  { id: 'lightning', title: 'Błyskawica', description: 'Pokonaj smoka w mniej niż 5 minut.', reward: 10, progress: (p) => [fastestWin(p) < 300 ? 1 : 0, 1] },
  {
    id: 'dragon-slayer',
    title: 'Pogromca smoków',
    description: 'Pokonaj wszystkie trzy smoki.',
    reward: 15,
    progress: (p) => [LEVELS.filter((d) => p.levels[d].wins > 0).length, 3],
  },
  { id: 'veteran', title: 'Weteran', description: 'Wygraj 10 walk ze smokami.', reward: 15, progress: (p) => [Math.min(10, totalWins(p)), 10] },
  { id: 'duelist', title: 'Pojedynkowicz', description: 'Wygraj pojedynek online.', reward: 5, progress: (p) => [Math.min(1, p.duels.won), 1] },
  { id: 'arena-master', title: 'Mistrz areny', description: 'Wygraj 10 pojedynków online.', reward: 20, progress: (p) => [Math.min(10, p.duels.won), 10] },
];

export function isAchieved(progress: Progress, achievement: Achievement): boolean {
  return progress.achievements[achievement.id] !== undefined;
}

function addStars(progress: Progress, stars: number): void {
  progress.stars += stars;
  progress.starsEarned += stars;
}

/** Unlocks every achievement whose goal is now met and pays its stars. Returns the new ones. */
function claimAchievements(progress: Progress, now: number): Achievement[] {
  const claimed: Achievement[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (isAchieved(progress, achievement)) continue;
    const [current, target] = achievement.progress(progress);
    if (current < target) continue;
    progress.achievements[achievement.id] = now;
    addStars(progress, achievement.reward);
    claimed.push(achievement);
  }
  return claimed;
}

export interface Reward {
  /** Stars for the fight itself (achievement stars come on top). */
  stars: number;
  /** For a battle: which of its three stars were won. */
  goals: StarGoal[];
  /** A level this fight opened. */
  unlocked: Difficulty | null;
  achievements: Achievement[];
}

/** Records a finished battle (won or lost) and pays its stars. Mutates `progress`. */
export function recordBattle(progress: Progress, result: BattleResult, now = Date.now()): Reward {
  const lockedBefore = LEVELS.filter((d) => !isUnlocked(progress, d));
  const level = progress.levels[result.difficulty];
  const goals = battleStars(result);
  const stars = goals.filter((goal) => goal.met).length;
  if (result.won) {
    level.wins++;
    level.bestStars = Math.max(level.bestStars, stars);
    level.bestTime = Math.min(level.bestTime ?? Infinity, result.seconds);
    if (result.mistakes === 0) progress.flawlessWins++;
  } else {
    level.losses++;
  }
  // A combo counts even in a lost battle.
  progress.bestCombo = Math.max(progress.bestCombo, result.bestCombo);
  addStars(progress, stars);
  return {
    stars,
    goals,
    unlocked: lockedBefore.find((d) => isUnlocked(progress, d)) ?? null,
    achievements: claimAchievements(progress, now),
  };
}

/** Stars for winning an online duel. */
export const DUEL_WIN_STARS = 2;

/** Records a finished online duel. Mutates `progress`. */
export function recordDuel(progress: Progress, won: boolean, now = Date.now()): Reward {
  progress.duels.played++;
  const stars = won ? DUEL_WIN_STARS : 0;
  if (won) progress.duels.won++;
  addStars(progress, stars);
  return { stars, goals: [], unlocked: null, achievements: claimAchievements(progress, now) };
}

/** A board theme is the player's once bought; the free one always is. */
export function ownsTheme(progress: Progress, theme: BoardTheme): boolean {
  return theme.price === 0 || progress.boardThemes.includes(theme.id);
}

/** The board theme in use. */
export function chosenTheme(progress: Progress): BoardTheme {
  return boardTheme(progress.boardTheme);
}

export type Purchase = 'bought' | 'owned' | 'too-few-stars';

/** Buys a board theme with stars and puts it on. Mutates `progress`. */
export function buyTheme(progress: Progress, theme: BoardTheme): Purchase {
  if (ownsTheme(progress, theme)) return 'owned';
  if (progress.stars < theme.price) return 'too-few-stars';
  progress.stars -= theme.price;
  progress.boardThemes.push(theme.id);
  progress.boardTheme = theme.id;
  return 'bought';
}

/** Puts on a board theme the player owns. Returns false (and changes nothing) for one not bought yet. */
export function chooseTheme(progress: Progress, theme: BoardTheme): boolean {
  if (!ownsTheme(progress, theme)) return false;
  progress.boardTheme = theme.id;
  return true;
}
