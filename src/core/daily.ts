import { createBattle, advanceTime, resolveMove } from './battle/battle.ts';
import { ENEMIES } from './battle/enemies.ts';
import { generatePuzzle, type Difficulty } from './sudoku/generator.ts';
import { applyMove } from './sudoku/moves.ts';

export interface DailyMove { cell: number; digit: number; at: number }
export function dailySeed(day: string, difficulty: Difficulty): number {
  let seed = 0x811c9dc5;
  for (const char of `${day}:${difficulty}`) seed = Math.imul(seed ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return seed;
}

/** Replays real moves against the common board and battle rules. Client scores/HP are never trusted.
 * Server wall time, not these active-play timestamps, determines the leaderboard time.
 */
export function verifyDaily(seed: number, difficulty: Difficulty, moves: unknown, wallMs: number): { mistakes: number } | null {
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 1000 || !Number.isFinite(wallMs) || wallMs < 0) return null;
  const puzzle = generatePuzzle(seed, difficulty);
  const grid = [...puzzle.givens];
  const battle = createBattle(ENEMIES[difficulty]);
  let at = 0, mistakes = 0;
  for (const move of moves) {
    if (!move || !Number.isInteger(move.cell) || move.cell < 0 || move.cell > 80 || !Number.isInteger(move.digit) ||
      move.digit < 1 || move.digit > 9 || !Number.isInteger(move.at) || move.at < at || move.at > wallMs + 1000 ||
      battle.outcome !== 'ongoing') return null;
    // Match the game loop across each complete attack interval; never discard a long gap.
    let seconds = (move.at - at) / 1000;
    while (seconds > 0 && battle.outcome === 'ongoing') {
      const step = Math.min(seconds, battle.enemy.attackEvery - battle.charge);
      advanceTime(battle, step); seconds = Math.max(0, seconds - step);
    }
    if (battle.outcome !== 'ongoing') return null;
    const result = applyMove(grid, puzzle.solution, move.cell, move.digit);
    if (result.kind === 'occupied') return null;
    if (result.kind === 'wrong') mistakes++;
    resolveMove(battle, result);
    at = move.at;
  }
  return battle.outcome === 'won' ? { mistakes } : null;
}
