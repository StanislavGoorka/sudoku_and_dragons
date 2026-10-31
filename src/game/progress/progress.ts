import { REGIONS, STAGES, type Difficulty, type Stage } from '../../core/index.ts';
import { BOARD_THEMES, boardTheme, DEFAULT_BOARD_THEME, type BoardTheme } from '../boardThemes.ts';
import { DEFAULT_DRAGON_SKIN, DRAGON_SKINS, dragonSkin, type DragonSkin } from '../dragonSkins.ts';
import { DEFAULT_HIT_EFFECT, HIT_EFFECTS, hitEffect, type HitEffect } from '../hitEffects.ts';
import { emptyDaily, winDaily, type DailyRecord } from './daily.ts';

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
  /** Every battle by board difficulty (campaign or daily): for records and achievements. */
  levels: Record<Difficulty, LevelRecord>;
  /** The campaign, by stage id (core/battle/campaign.ts): what opens the next stage. */
  stages: Record<string, LevelRecord>;
  duels: { played: number; won: number };
  /** Battles won without a single mistake. */
  flawlessWins: number;
  /** Most rows, columns and boxes completed with one digit. */
  bestCombo: number;
  /** The daily challenge: last day won, streak, wins (daily.ts). */
  daily: DailyRecord;
  /** Unlocked achievements: id → when (ms since epoch). */
  achievements: Record<string, number>;
  /** Board themes bought (the free one is not listed). */
  boardThemes: string[];
  /** The board theme in use. */
  boardTheme: string;
  /** Dragon skins bought (the free one is not listed). */
  dragonSkins: string[];
  /** The skin of your dragon in duels. */
  dragonSkin: string;
  /** Hit effects bought (the free one is not listed). */
  hitEffects: string[];
  /** How your hits fly to the dragon you attack. */
  hitEffect: string;
}

export function emptyProgress(): Progress {
  const level = (): LevelRecord => ({ wins: 0, losses: 0, bestStars: 0, bestTime: null });
  return {
    stars: 0,
    starsEarned: 0,
    levels: { easy: level(), medium: level(), hard: level() },
    stages: {},
    duels: { played: 0, won: 0 },
    flawlessWins: 0,
    bestCombo: 0,
    daily: emptyDaily(),
    achievements: {},
    boardThemes: [],
    boardTheme: DEFAULT_BOARD_THEME,
    dragonSkins: [],
    dragonSkin: DEFAULT_DRAGON_SKIN,
    hitEffects: [],
    hitEffect: DEFAULT_HIT_EFFECT,
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
  const record = (level: Partial<LevelRecord>): LevelRecord => ({
    wins: count(level.wins),
    losses: count(level.losses),
    bestStars: Math.min(3, count(level.bestStars)),
    bestTime: typeof level.bestTime === 'number' && level.bestTime > 0 ? level.bestTime : null,
  });
  for (const difficulty of LEVELS) {
    const level = saved.levels?.[difficulty];
    if (level) progress.levels[difficulty] = record(level);
  }
  if (saved.stages && typeof saved.stages === 'object') {
    for (const { id } of STAGES) {
      const stage = saved.stages[id];
      if (stage) progress.stages[id] = record(stage);
    }
  } else {
    // Saved before the campaign, when each level had one dragon: a level won counts as its whole region.
    for (const region of REGIONS) {
      const level = progress.levels[region.difficulty];
      if (level.wins === 0) continue;
      for (const stage of region.stages) progress.stages[stage.id] = { ...level, wins: 1, losses: 0 };
    }
  }
  progress.duels = { played: count(saved.duels?.played), won: count(saved.duels?.won) };
  progress.flawlessWins = count(saved.flawlessWins);
  progress.bestCombo = count(saved.bestCombo);
  const daily = saved.daily;
  if (daily && typeof daily.lastWon === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily.lastWon)) {
    progress.daily = {
      lastWon: daily.lastWon,
      streak: Math.max(1, count(daily.streak)),
      bestStreak: Math.max(1, count(daily.bestStreak), count(daily.streak)),
      wins: Math.max(1, count(daily.wins)),
    };
  }
  // In the order of ACHIEVEMENTS, like the lists of bought items, so equal progress saves as equal JSON.
  const unlocked: Record<string, unknown> = saved.achievements ?? {};
  for (const { id } of ACHIEVEMENTS) {
    if (unlocked[id] !== undefined) progress.achievements[id] = count(unlocked[id]);
  }
  for (const kind of COSMETIC_KINDS) {
    const { owned, chosen } = SLOTS[kind];
    const bought: unknown[] = Array.isArray(saved[owned]) ? saved[owned] : [];
    progress[owned] = COSMETICS[kind].filter((item) => item.price > 0 && bought.includes(item.id)).map((item) => item.id);
    const pick = COSMETICS[kind].find((item) => item.id === saved[chosen]);
    if (pick && owns(progress, kind, pick)) progress[chosen] = pick.id;
  }
  return progress;
}

/** A campaign stage is open once the one before it has been won (the first one always is). */
export function isStageUnlocked(progress: Progress, stage: Stage): boolean {
  const before = STAGES[STAGES.indexOf(stage) - 1];
  return !before || (progress.stages[before.id]?.wins ?? 0) > 0;
}

export function stageRecord(progress: Progress, stage: Stage): LevelRecord {
  return progress.stages[stage.id] ?? { wins: 0, losses: 0, bestStars: 0, bestTime: null };
}

/** The stage to play next: the first open one not won yet (or the last boss, once all are won). */
export function currentStage(progress: Progress): Stage {
  return STAGES.find((stage) => isStageUnlocked(progress, stage) && stageRecord(progress, stage).wins === 0) ?? STAGES[STAGES.length - 1];
}

/** A board difficulty is open once its campaign region is (for the daily challenge). */
export function isUnlocked(progress: Progress, difficulty: Difficulty): boolean {
  const region = REGIONS.find((r) => r.difficulty === difficulty);
  return !region || isStageUnlocked(progress, region.stages[0]);
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
  /** The campaign stage this battle was, by id. */
  stage?: string;
  /** The day ('YYYY-MM-DD') whose daily challenge this battle was. */
  daily?: string;
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
    description: 'Pokonaj bossów wszystkich trzech krain.',
    reward: 15,
    progress: (p) => [REGIONS.filter((r) => (p.stages[r.stages[r.stages.length - 1].id]?.wins ?? 0) > 0).length, REGIONS.length],
  },
  { id: 'veteran', title: 'Weteran', description: 'Wygraj 10 walk ze smokami.', reward: 15, progress: (p) => [Math.min(10, totalWins(p)), 10] },
  { id: 'daily', title: 'Wyzwanie przyjęte', description: 'Wygraj wyzwanie dnia.', reward: 5, progress: (p) => [Math.min(1, p.daily.wins), 1] },
  {
    id: 'daily-week',
    title: 'Tydzień ze smokami',
    description: 'Wygraj wyzwanie dnia 7 dni z rzędu.',
    reward: 20,
    progress: (p) => [Math.min(7, p.daily.bestStreak), 7],
  },
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
  /** The campaign stage this fight opened (a new region's first stage after a boss). */
  unlocked: Stage | null;
  /** The daily challenge's reward, when this battle won it for the first time today. */
  daily: { stars: number; streak: number } | null;
  achievements: Achievement[];
}

/** Records a finished battle (won or lost) and pays its stars. Mutates `progress`. */
export function recordBattle(progress: Progress, result: BattleResult, now = Date.now()): Reward {
  const lockedBefore = STAGES.filter((stage) => !isStageUnlocked(progress, stage));
  const goals = battleStars(result);
  const stars = goals.filter((goal) => goal.met).length;
  const records = [progress.levels[result.difficulty]];
  if (result.stage && STAGES.some((stage) => stage.id === result.stage)) {
    progress.stages[result.stage] ??= { wins: 0, losses: 0, bestStars: 0, bestTime: null };
    records.push(progress.stages[result.stage]);
  }
  for (const level of records) {
    if (result.won) {
      level.wins++;
      level.bestStars = Math.max(level.bestStars, stars);
      level.bestTime = Math.min(level.bestTime ?? Infinity, result.seconds);
    } else {
      level.losses++;
    }
  }
  if (result.won && result.mistakes === 0) progress.flawlessWins++;
  // A combo counts even in a lost battle.
  progress.bestCombo = Math.max(progress.bestCombo, result.bestCombo);
  addStars(progress, stars);
  const daily = result.won && result.daily ? winDaily(progress.daily, result.daily) : null;
  if (daily) addStars(progress, daily.stars);
  return {
    stars,
    goals,
    unlocked: lockedBefore.find((stage) => isStageUnlocked(progress, stage)) ?? null,
    daily,
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
  return { stars, goals: [], unlocked: null, daily: null, achievements: claimAchievements(progress, now) };
}

/** Something bought with stars that changes only how the game looks. */
export interface Cosmetic {
  id: string;
  name: string;
  /** 0 for the one everyone has. */
  price: number;
}

/** The shop's shelves: board themes, dragon skins and hit effects. */
export type CosmeticKind = 'board' | 'dragon' | 'effect';
export const COSMETIC_KINDS: CosmeticKind[] = ['board', 'dragon', 'effect'];
export const COSMETICS: Record<CosmeticKind, readonly Cosmetic[]> = { board: BOARD_THEMES, dragon: DRAGON_SKINS, effect: HIT_EFFECTS };
/** Where Progress keeps each kind: the ones bought, and the one in use. */
const SLOTS = {
  board: { owned: 'boardThemes', chosen: 'boardTheme' },
  dragon: { owned: 'dragonSkins', chosen: 'dragonSkin' },
  effect: { owned: 'hitEffects', chosen: 'hitEffect' },
} as const satisfies Record<CosmeticKind, { owned: keyof Progress; chosen: keyof Progress }>;

/** A cosmetic is the player's once bought; the free one of each kind always is. */
export function owns(progress: Progress, kind: CosmeticKind, item: Cosmetic): boolean {
  return item.price === 0 || progress[SLOTS[kind].owned].includes(item.id);
}

export function isChosen(progress: Progress, kind: CosmeticKind, item: Cosmetic): boolean {
  return progress[SLOTS[kind].chosen] === item.id;
}

/** The stars buy something of this kind (or of any kind) not owned yet. */
export function canBuyNew(progress: Progress, kind?: CosmeticKind): boolean {
  return (kind ? [kind] : COSMETIC_KINDS).some((k) =>
    COSMETICS[k].some((item) => !owns(progress, k, item) && progress.stars >= item.price),
  );
}

export type Purchase = 'bought' | 'owned' | 'too-few-stars';

/** Buys a cosmetic with stars and puts it on. Mutates `progress`. */
export function buy(progress: Progress, kind: CosmeticKind, item: Cosmetic): Purchase {
  if (owns(progress, kind, item)) return 'owned';
  if (progress.stars < item.price) return 'too-few-stars';
  progress.stars -= item.price;
  progress[SLOTS[kind].owned].push(item.id);
  progress[SLOTS[kind].chosen] = item.id;
  return 'bought';
}

/** Puts on a cosmetic the player owns. Returns false (and changes nothing) for one not bought yet. */
export function choose(progress: Progress, kind: CosmeticKind, item: Cosmetic): boolean {
  if (!owns(progress, kind, item)) return false;
  progress[SLOTS[kind].chosen] = item.id;
  return true;
}

/** The board theme in use. */
export function chosenTheme(progress: Progress): BoardTheme {
  return boardTheme(progress.boardTheme);
}

/** The skin of your dragon in duels. */
export function chosenSkin(progress: Progress): DragonSkin {
  return dragonSkin(progress.dragonSkin);
}

/** How your hits fly. */
export function chosenEffect(progress: Progress): HitEffect {
  return hitEffect(progress.hitEffect);
}

/**
 * Joins two copies of the progress that both grew from `base`: this device's (`local`) and the
 * one saved in the cloud by another device (`remote`). What each copy gained since `base` is
 * added up (wins, stars, duels), the best records and everything bought or unlocked are kept, and
 * the look in use is this device's if it changed it. Stars paid twice (the same theme bought, the
 * same achievement unlocked on both) are counted once. With an empty `base`, it adds a guest's
 * progress to an account's.
 */
export function mergeProgress(base: Progress, local: Progress, remote: Progress): Progress {
  const sum = (b: number, l: number, r: number) => Math.max(0, l + r - b);
  const merged = emptyProgress();
  let stars = sum(base.stars, local.stars, remote.stars);
  let earned = sum(base.starsEarned, local.starsEarned, remote.starsEarned);
  const mergeRecord = (b: LevelRecord | undefined, l: LevelRecord | undefined, r: LevelRecord | undefined): LevelRecord => {
    const none: LevelRecord = { wins: 0, losses: 0, bestStars: 0, bestTime: null };
    [b, l, r] = [b ?? none, l ?? none, r ?? none];
    const times = [l.bestTime, r.bestTime].filter((t): t is number => t !== null);
    return {
      wins: sum(b.wins, l.wins, r.wins),
      losses: sum(b.losses, l.losses, r.losses),
      bestStars: Math.max(l.bestStars, r.bestStars),
      bestTime: times.length ? Math.min(...times) : null,
    };
  };
  for (const difficulty of LEVELS) {
    merged.levels[difficulty] = mergeRecord(base.levels[difficulty], local.levels[difficulty], remote.levels[difficulty]);
  }
  for (const { id } of STAGES) {
    if (local.stages[id] || remote.stages[id]) merged.stages[id] = mergeRecord(base.stages[id], local.stages[id], remote.stages[id]);
  }
  merged.duels = {
    played: sum(base.duels.played, local.duels.played, remote.duels.played),
    won: sum(base.duels.won, local.duels.won, remote.duels.won),
  };
  merged.flawlessWins = sum(base.flawlessWins, local.flawlessWins, remote.flawlessWins);
  merged.bestCombo = Math.max(local.bestCombo, remote.bestCombo);
  // The daily streak is the one of the side that won the later day.
  const [ld, rd] = [local.daily, remote.daily];
  const later = (ld.lastWon ?? '') >= (rd.lastWon ?? '') ? ld : rd;
  merged.daily = {
    lastWon: later.lastWon,
    streak: ld.lastWon === rd.lastWon ? Math.max(ld.streak, rd.streak) : later.streak,
    bestStreak: Math.max(ld.bestStreak, rd.bestStreak),
    wins: sum(base.daily.wins, ld.wins, rd.wins),
  };
  for (const achievement of ACHIEVEMENTS) {
    const { id } = achievement;
    const times = [local.achievements[id], remote.achievements[id]].filter((t): t is number => t !== undefined);
    if (times.length === 0) continue;
    merged.achievements[id] = Math.min(...times);
    // Unlocked on both sides since base: its reward was paid twice.
    if (times.length === 2 && base.achievements[id] === undefined) {
      stars -= achievement.reward;
      earned -= achievement.reward;
    }
  }
  for (const kind of COSMETIC_KINDS) {
    const { owned, chosen } = SLOTS[kind];
    for (const item of COSMETICS[kind]) {
      const inLocal = local[owned].includes(item.id);
      const inRemote = remote[owned].includes(item.id);
      if (inLocal || inRemote) merged[owned].push(item.id);
      // Bought on both sides since base: paid for twice.
      if (inLocal && inRemote && !base[owned].includes(item.id)) stars += item.price;
    }
    merged[chosen] = local[chosen] !== base[chosen] ? local[chosen] : remote[chosen];
  }
  merged.stars = Math.max(0, stars);
  merged.starsEarned = Math.max(0, earned);
  return parseProgress(merged);
}

/**
 * Recovers overlapping snapshots without a common base. Their independent gains cannot be known,
 * so keep the larger counters and the union of records/purchases, never add their totals together.
 * Only a known guest changing accounts is merged additively with an empty base.
 */
export function recoverProgress(local: Progress, remote: Progress): Progress {
  const recovered = mergeProgress(emptyProgress(), local, remote);
  for (const difficulty of LEVELS) {
    recovered.levels[difficulty].wins = Math.max(local.levels[difficulty].wins, remote.levels[difficulty].wins);
    recovered.levels[difficulty].losses = Math.max(local.levels[difficulty].losses, remote.levels[difficulty].losses);
  }
  for (const { id } of STAGES) {
    const record = recovered.stages[id];
    if (!record) continue;
    record.wins = Math.max(local.stages[id]?.wins ?? 0, remote.stages[id]?.wins ?? 0);
    record.losses = Math.max(local.stages[id]?.losses ?? 0, remote.stages[id]?.losses ?? 0);
  }
  recovered.duels = {
    played: Math.max(local.duels.played, remote.duels.played),
    won: Math.max(local.duels.won, remote.duels.won),
  };
  recovered.flawlessWins = Math.max(local.flawlessWins, remote.flawlessWins);
  recovered.daily.wins = Math.max(local.daily.wins, remote.daily.wins);
  recovered.starsEarned = Math.max(local.starsEarned, remote.starsEarned);

  // Reconcile the wallet with all retained purchases. Taking the larger balance alone would
  // refund something bought on the other copy. Preserve spending unknown to this client too.
  const spentOnCosmetics = (p: Progress) => COSMETIC_KINDS.reduce((sum, kind) => sum +
    COSMETICS[kind].filter((item) => p[SLOTS[kind].owned].includes(item.id)).reduce((cost, item) => cost + item.price, 0), 0);
  const otherSpending = Math.max(
    0,
    local.starsEarned - local.stars - spentOnCosmetics(local),
    remote.starsEarned - remote.stars - spentOnCosmetics(remote),
  );
  recovered.stars = Math.max(0, recovered.starsEarned - spentOnCosmetics(recovered) - otherSpending);
  return parseProgress(recovered);
}

/** The same progress, whatever order things were bought or unlocked in. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return JSON.stringify(parseProgress(a)) === JSON.stringify(parseProgress(b));
}
