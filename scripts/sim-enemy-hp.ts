// When does the dragon fall? Plays 150 boards per difficulty perfectly (no mistakes, no timer)
// and reports at what share of the empty cells the enemy HP reaches 0.
// Usage: node scripts/sim-enemy-hp.ts
import {
  applyMove,
  createBattle,
  createRng,
  DRAGON,
  generatePuzzle,
  resolveMove,
  shuffle,
  type Difficulty,
} from '../src/core/index.ts';

for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
  const killedAt: number[] = [];
  let finishers = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const { givens, solution } = generatePuzzle(seed, difficulty);
    const board = [...givens];
    const empty = givens.flatMap((v, i) => (v === 0 ? [i] : []));
    const order = shuffle([...empty], createRng(seed * 7919));
    const battle = createBattle(DRAGON);
    for (let k = 0; k < order.length; k++) {
      const hit = resolveMove(battle, applyMove(board, solution, order[k], solution[order[k]]));
      if (battle.outcome === 'won') {
        if (hit?.finisher) finishers++;
        killedAt.push((k + 1) / order.length);
        break;
      }
    }
  }
  killedAt.sort((a, b) => a - b);
  const pct = (q: number) => Math.round(killedAt[Math.floor(q * (killedAt.length - 1))] * 100);
  console.log(
    `${difficulty}: dragon dies at p10=${pct(0.1)}% median=${pct(0.5)}% p90=${pct(0.9)}% of empty cells; finisher needed in ${finishers}/150`,
  );
}
