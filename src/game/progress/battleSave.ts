import { createBattle, ENEMIES, generatePuzzle, stageById, type Battle, type Difficulty, type Grid, type Puzzle } from '../../core/index.ts';
import type { DailyMove } from '../../core/index.ts';
import type { RankedRun } from '../net/daily.ts';

/** Device-local checkpoint. Stored with progress so finishing and paying a battle is one write. */
export interface SavedBattle {
  version: 1;
  puzzle: Puzzle;
  stage?: string;
  daily?: string;
  grid: Grid;
  battle: Battle;
  notes: number[];
  notesMode: boolean;
  selected: number | null;
  mistakes: number;
  bestCombo: number;
  elapsed: number;
  ranked?: { run: RankedRun; moves: DailyMove[] };
}

const finite = (n: unknown, min: number, max = Number.MAX_SAFE_INTEGER): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const integer = (n: unknown, min: number, max?: number): n is number => finite(n, min, max) && Number.isInteger(n);

/** Corrupt, obsolete or finished checkpoints never start a battle or pay a reward. */
export function parseSavedBattle(value: unknown): SavedBattle | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as SavedBattle;
  if (s.version !== 1 || !s.puzzle || !integer(s.puzzle.seed, 0, 0xffffffff) ||
      !['easy', 'medium', 'hard'].includes(s.puzzle.difficulty)) return null;
  const stage = s.stage === undefined ? undefined : typeof s.stage === 'string' ? stageById(s.stage) : undefined;
  if (s.stage !== undefined && (!stage || stage.region.difficulty !== s.puzzle.difficulty)) return null;
  if (s.daily !== undefined && (s.stage !== undefined || typeof s.daily !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.daily))) return null;
  const puzzle = generatePuzzle(s.puzzle.seed, s.puzzle.difficulty as Difficulty);
  const battle = createBattle(stage?.enemy ?? ENEMIES[puzzle.difficulty]);
  if (!Array.isArray(s.grid) || s.grid.length !== 81 || !s.grid.every((digit, cell) =>
    integer(digit, 0, 9) && (puzzle.givens[cell] ? digit === puzzle.givens[cell] : digit === 0 || digit === puzzle.solution[cell]))) return null;
  if (!s.grid.includes(0) || !s.battle || s.battle.outcome !== 'ongoing' ||
      !integer(s.battle.playerHp, 1, battle.playerMaxHp) || !integer(s.battle.enemyHp, 1, battle.enemy.maxHp) ||
      !finite(s.battle.charge, 0, battle.enemy.attackEvery)) return null;
  if (!Array.isArray(s.notes) || s.notes.length !== 81 || !s.notes.every((bits) => integer(bits, 0, 1022) && !(bits & 1)) ||
      typeof s.notesMode !== 'boolean' || (s.selected !== null && !integer(s.selected, 0, 80)) ||
      !integer(s.mistakes, 0) || !integer(s.bestCombo, 0, 3) || !finite(s.elapsed, 0)) return null;
  return {
    version: 1, puzzle, stage: s.stage, daily: s.daily, grid: [...s.grid],
    battle: { ...battle, playerHp: s.battle.playerHp, enemyHp: s.battle.enemyHp, charge: s.battle.charge },
    notes: s.notes.map((bits, cell) => s.grid[cell] === 0 ? bits : 0),
    notesMode: s.notesMode, selected: s.selected, mistakes: s.mistakes, bestCombo: s.bestCombo, elapsed: s.elapsed,
    ranked: s.ranked && s.ranked.run?.seed === puzzle.seed && s.ranked.run.difficulty === puzzle.difficulty &&
      s.ranked.run.day === s.daily && /^[0-9a-f-]{36}$/i.test(s.ranked.run.id) && typeof s.ranked.run.user_id === 'string' &&
      Array.isArray(s.ranked.moves) && s.ranked.moves.length <= 1000 ? structuredClone(s.ranked) : undefined,
  };
}
