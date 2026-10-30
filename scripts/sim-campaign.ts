// Every campaign stage: when its dragon falls (board share, with no mistakes and no clock), and how much
// HP its timed attack takes at several speeds (seconds per digit). Within a region the stages should
// get harder, and the boss should be the hardest; stage 1 of each region is the old level's dragon.
// Usage: node scripts/sim-campaign.ts [stage id]
import {
  advanceTime,
  applyMove,
  CLUES,
  createBattle,
  createRng,
  generatePuzzle,
  resolveMove,
  shuffle,
  STAGES,
} from '../src/core/index.ts';

const SEEDS = 80;
const SPEEDS = [8, 10, 12, 14];
const only = process.argv[2];

for (const stage of STAGES.filter((s) => !only || s.id === only)) {
  const { enemy, region } = stage;
  const difficulty = region.difficulty;
  const columns: string[] = [];
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
    columns.push(`${secondsPerCell}s: ${String(hpLeft[SEEDS / 2]).padStart(2)} HP${deaths ? ` (${deaths} lost)` : ''}`);
  }
  const minutes = ((10 * (81 - CLUES[difficulty])) / 60).toFixed(0);
  console.log(
    `${stage.id.padEnd(11)} ${enemy.name.padEnd(17)} ${String(enemy.maxHp).padStart(3)} HP, ` +
      `every ${enemy.attackEvery}s for ${enemy.timedAttack}, mistake ${enemy.attack} | ${columns.join(' · ')}  (10 s/digit ≈ ${minutes} min)`,
  );
}
