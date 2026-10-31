import { describe, expect, it } from 'vitest';
import { advanceTime, applyMove, createBattle, ENEMIES, generatePuzzle, resolveMove, type Difficulty, type DailyMove } from './index.ts';
import { dailySeed, verifyDaily } from './daily.ts';

function wonReplay(difficulty: Difficulty): DailyMove[] {
  const puzzle = generatePuzzle(dailySeed('2026-10-31', difficulty), difficulty);
  const grid = [...puzzle.givens], battle = createBattle(ENEMIES[difficulty]);
  const moves: DailyMove[] = [];
  for (let cell = 0; cell < 81 && battle.outcome === 'ongoing'; cell++) if (!grid[cell]) {
    const digit = puzzle.solution[cell];
    moves.push({ cell, digit, at: moves.length * 1000 });
    resolveMove(battle, applyMove(grid, puzzle.solution, cell, digit));
  }
  return moves;
}
describe('server-verified daily results', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) it(`replays a winning ${difficulty} board`, () => {
    expect(verifyDaily(dailySeed('2026-10-31', difficulty), difficulty, wonReplay(difficulty), 100000)).toEqual({ mistakes: 0 });
  });
  it('uses the same date/category seed on every device', () => {
    expect(dailySeed('2026-10-31', 'easy')).toBe(dailySeed('2026-10-31', 'easy'));
    expect(dailySeed('2026-10-31', 'hard')).not.toBe(dailySeed('2026-10-31', 'easy'));
    expect(dailySeed('2026-11-01', 'easy')).not.toBe(dailySeed('2026-10-31', 'easy'));
  });
  it('rejects incomplete, occupied, wrong-board, malformed and impossible-timeline replays', () => {
    const seed = dailySeed('2026-10-31', 'easy'), moves = wonReplay('easy');
    for (const invalid of [[], moves.slice(0, 3), [moves[0], moves[0], ...moves.slice(1)],
      [{ ...moves[0], cell: 81 }, ...moves.slice(1)], [{ ...moves[0], digit: 0 }, ...moves.slice(1)],
      [{ ...moves[0], at: -1 }, ...moves.slice(1)], moves.map((m) => ({ ...m, at: m.at + 200000 }))]) {
      expect(verifyDaily(seed, 'easy', invalid, 100000)).toBeNull();
    }
    expect(verifyDaily(seed + 1, 'easy', moves, 100000)).toBeNull();
  });
  it('rejects a history that would have lost to the dragon before the first move', () => {
    expect(verifyDaily(dailySeed('2026-10-31', 'easy'), 'easy', wonReplay('easy').map((m) => ({ ...m, at: m.at + 1000000 })), 1100000)).toBeNull();
  });
  it('accepts winning histories from a frame-driven game loop at different solving speeds', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) for (let seed = 1; seed <= 12; seed++) {
      const puzzle = generatePuzzle(seed, difficulty), grid = [...puzzle.givens], battle = createBattle(ENEMIES[difficulty]);
      const moves: DailyMove[] = [];
      let elapsed = 0;
      for (let cell = 0; cell < 81 && battle.outcome === 'ongoing'; cell++) if (!grid[cell]) {
        const step = 0.016 + (seed % 5) * 0.007;
        for (let t = 0; t < 8 + seed * 0.7 && battle.outcome === 'ongoing'; t += step) {
          advanceTime(battle, step); elapsed += step;
        }
        if (battle.outcome !== 'ongoing') break;
        moves.push({ cell, digit: puzzle.solution[cell], at: Math.round(elapsed * 1000) });
        resolveMove(battle, applyMove(grid, puzzle.solution, cell, puzzle.solution[cell]));
      }
      if (battle.outcome === 'won') expect(verifyDaily(seed, difficulty, moves, elapsed * 1000 + 1000), `${difficulty}/${seed}`).not.toBeNull();
    }
  });
});
