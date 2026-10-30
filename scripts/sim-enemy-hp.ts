// When does each dragon fall? Plays 150 boards per difficulty perfectly (no mistakes, no timer)
// against that difficulty's enemy, and reports at what share of the empty cells its HP reaches 0,
// plus the total damage a whole board deals (keep maxHp a little below its low end).
// Usage: node scripts/sim-enemy-hp.ts
import {
  applyMove,
  closesBox,
  createBattle,
  createRng,
  ENEMIES,
  generatePuzzle,
  moveDamage,
  resolveMove,
  shuffle,
  type Difficulty,
} from '../src/core/index.ts';

const SEEDS = 150;

for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
  const enemy = ENEMIES[difficulty];
  const killedAt: number[] = [];
  const totals: number[] = [];
  let finishers = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { givens, solution } = generatePuzzle(seed, difficulty);
    const board = [...givens];
    const order = shuffle(givens.flatMap((v, i) => (v === 0 ? [i] : [])), createRng(seed * 7919));
    const battle = createBattle(enemy);
    let total = 0;
    for (let k = 0; k < order.length; k++) {
      const move = applyMove(board, solution, order[k], solution[order[k]]);
      if (move.kind === 'correct') total += moveDamage(move.digit, closesBox(move.completed));
      const hit = resolveMove(battle, move);
      if (hit?.hpAfter === 0) {
        if (hit.finisher) finishers++;
        killedAt.push((k + 1) / order.length);
      }
    }
    totals.push(total);
  }
  const pick = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.floor(q * (values.length - 1))];
  const pct = (q: number) => Math.round(pick(killedAt, q) * 100);
  console.log(
    `${difficulty.padEnd(6)} ${enemy.name} (${enemy.maxHp} HP): falls at p10=${pct(0.1)}% median=${pct(0.5)}% ` +
      `of empty cells, finisher needed ${finishers}/${SEEDS}; board damage min=${pick(totals, 0)} ` +
      `p10=${pick(totals, 0.1)} median=${pick(totals, 0.5)}`,
  );
}
