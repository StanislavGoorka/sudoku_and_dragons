// How much does the timed attack hurt? Plays boards without mistakes at several speeds
// (seconds per digit) and reports the player HP left.
import {
  advanceTime,
  applyMove,
  createBattle,
  createRng,
  DRAGON,
  generatePuzzle,
  resolveMove,
  shuffle,
  type Difficulty,
  type EnemyDef,
} from '../src/core/index.ts';

// Usage: node scripts/sim-timer.ts [attackEvery] [timedAttack]
const enemy: EnemyDef = {
  ...DRAGON,
  attackEvery: Number(process.argv[2] ?? DRAGON.attackEvery),
  timedAttack: Number(process.argv[3] ?? DRAGON.timedAttack),
};
console.log(`attackEvery=${enemy.attackEvery}s timedAttack=${enemy.timedAttack}`);

const SEEDS = 120;
for (const difficulty of ['easy', 'medium'] as Difficulty[]) {
  for (const secondsPerCell of [5, 8, 12, 16, 20, 25]) {
    const hpLeft: number[] = [];
    let deaths = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { givens, solution } = generatePuzzle(seed, difficulty);
      const board = [...givens];
      const rng = createRng(seed * 31 + secondsPerCell);
      const order = shuffle(givens.flatMap((v, i) => (v === 0 ? [i] : [])), rng);
      const battle = createBattle(enemy);
      for (const cell of order) {
        // Think time per digit: uniform in [0.4, 1.6] × the average.
        let think = secondsPerCell * (0.4 + 1.2 * rng());
        while (think > 0 && battle.outcome === 'ongoing') {
          advanceTime(battle, Math.min(0.1, think));
          think -= 0.1;
        }
        if (battle.outcome !== 'ongoing') break;
        resolveMove(battle, applyMove(board, solution, cell, solution[cell]));
        if (battle.outcome !== 'ongoing') break;
      }
      if (battle.outcome === 'lost') deaths++;
      hpLeft.push(battle.playerHp);
    }
    hpLeft.sort((a, b) => a - b);
    const minutes = ((secondsPerCell * (givens(difficulty))) / 60).toFixed(1);
    console.log(
      `${difficulty.padEnd(6)} ${String(secondsPerCell).padStart(2)}s/digit (~${minutes} min): ` +
        `HP left median=${hpLeft[SEEDS / 2]} worst=${hpLeft[0]}  deaths=${deaths}/${SEEDS}`,
    );
  }
}

function givens(difficulty: Difficulty): number {
  return 81 - { easy: 40, medium: 32, hard: 26 }[difficulty];
}
