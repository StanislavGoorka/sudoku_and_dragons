// How much does each dragon's timed attack hurt? Plays boards without mistakes at several speeds
// (seconds per digit) and reports the player HP left.
// Usage: node scripts/sim-timer.ts [difficulty] [attackEvery] [timedAttack]
// The optional numbers override that difficulty's enemy, to try values before changing enemies.ts.
import {
  advanceTime,
  applyMove,
  CLUES,
  createBattle,
  createRng,
  ENEMIES,
  generatePuzzle,
  resolveMove,
  shuffle,
  type Difficulty,
  type EnemyDef,
} from '../src/core/index.ts';

const SEEDS = 120;
const SPEEDS = [5, 8, 10, 12, 14, 16, 20];

const only = process.argv[2] as Difficulty | undefined;
const difficulties: Difficulty[] = only ? [only] : ['easy', 'medium', 'hard'];

for (const difficulty of difficulties) {
  const enemy: EnemyDef = {
    ...ENEMIES[difficulty],
    attackEvery: Number(process.argv[3] ?? ENEMIES[difficulty].attackEvery),
    timedAttack: Number(process.argv[4] ?? ENEMIES[difficulty].timedAttack),
  };
  console.log(`${difficulty}: ${enemy.name}, attack every ${enemy.attackEvery} s for ${enemy.timedAttack} HP`);

  for (const secondsPerCell of SPEEDS) {
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
    const minutes = ((secondsPerCell * (81 - CLUES[difficulty])) / 60).toFixed(1);
    console.log(
      `  ${String(secondsPerCell).padStart(2)} s/digit (~${minutes.padStart(4)} min): ` +
        `HP left median=${String(hpLeft[SEEDS / 2]).padStart(2)} worst=${String(hpLeft[0]).padStart(2)}  ` +
        `deaths=${deaths}/${SEEDS}`,
    );
  }
}
