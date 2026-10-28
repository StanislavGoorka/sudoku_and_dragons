// Duel balance: plays many duels between simple bots and reports how they end.
// Bots always know the right digit but slip with a given mistake rate. Strategies:
//   random  - any empty cell
//   smart   - completes rows/columns/boxes when it can, otherwise avoids leaving the opponent
//             a unit with a single gap
// Usage: node scripts/sim-duel.ts [mistakeRate=0.05]
import {
  createDuel,
  createRng,
  DUEL_RULES,
  generatePuzzle,
  playDuelMove,
  unitCells,
  unitsOf,
  type Grid,
  type Rng,
  type Seat,
} from '../src/core/index.ts';

type Strategy = 'random' | 'smart';
const MISTAKE_RATE = Number(process.argv[2] ?? 0.05);
const GAMES = 300;

function gaps(board: Grid, cells: number[]): number {
  return cells.filter((c) => board[c] === 0).length;
}

function pickCell(board: Grid, strategy: Strategy, rng: Rng): number {
  const empty = board.flatMap((v, i) => (v === 0 ? [i] : []));
  if (strategy === 'random') return empty[Math.floor(rng() * empty.length)];
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const cell of empty) {
    let completes = 0;
    let gifts = 0;
    for (const unit of unitsOf(cell)) {
      const left = gaps(board, unitCells(unit)) - 1;
      if (left === 0) completes++;
      if (left === 1) gifts++;
    }
    const score = completes * 10 - gifts;
    if (score > bestScore) {
      bestScore = score;
      best = [cell];
    } else if (score === bestScore) {
      best.push(cell);
    }
  }
  return best[Math.floor(rng() * best.length)];
}

function play(seed: number, strategies: [Strategy, Strategy]) {
  const { givens, solution } = generatePuzzle(seed, 'easy');
  const rng = createRng(seed * 101);
  const first: Seat = rng() < 0.5 ? 0 : 1;
  const duel = createDuel(givens, first);
  const empty = givens.filter((v) => v === 0).length;
  let turns = 0;
  let lastTurn = duel.turn;
  while (!duel.finished) {
    const seat = duel.turn;
    const cell = pickCell(duel.board, strategies[seat], rng);
    const slip = rng() < MISTAKE_RATE;
    const digit = slip ? (solution[cell] % 9) + 1 : solution[cell];
    playDuelMove(duel, solution, seat, cell, digit);
    if (duel.turn !== lastTurn) {
      turns++;
      lastTurn = duel.turn;
    }
  }
  const filled = 1 - duel.board.filter((v) => v === 0).length / empty;
  const ko = duel.hp.includes(0);
  return { winner: duel.winner, first, filled, ko, turns };
}

console.log(`HP ${DUEL_RULES.maxHp}, ${DUEL_RULES.movesPerTurn} moves per turn, mistake rate ${MISTAKE_RATE}`);
for (const strategies of [
  ['random', 'random'],
  ['smart', 'smart'],
  ['smart', 'random'],
] as [Strategy, Strategy][]) {
  const results = Array.from({ length: GAMES }, (_, i) => play(i + 1, strategies));
  const share = (f: (r: (typeof results)[number]) => boolean) =>
    `${Math.round((results.filter(f).length / GAMES) * 100)}%`;
  const avg = (f: (r: (typeof results)[number]) => number) =>
    (results.reduce((sum, r) => sum + f(r), 0) / GAMES).toFixed(0);
  console.log(
    `${strategies.join(' vs ').padEnd(16)} KO ${share((r) => r.ko)}, board filled ~${avg((r) => r.filled * 100)}%, ` +
      `~${avg((r) => r.turns)} turns | first mover wins ${share((r) => r.winner === r.first)}, ` +
      `seat 0 wins ${share((r) => r.winner === 0)}, draws ${share((r) => r.winner === null)}`,
  );
}
