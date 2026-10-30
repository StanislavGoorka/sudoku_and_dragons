import type { Difficulty } from '../sudoku/generator.ts';
import type { EnemyDef } from './battle.ts';

/**
 * One dragon per difficulty. Names are Polish and masculine, because the UI builds
 * sentences like "{name} pokonany!".
 *
 * Tuned with `npm run sim:hp` and `npm run sim:timer`:
 * - maxHp sits just under the damage a whole board deals (each digit deals its value, doubled when it
 *   closes a 3×3 box: ~200-320 a board), so the dragon falls with the last digits;
 * - attackEvery and timedAttack set how fast you must play (no mistakes): see each entry.
 */
export const ENEMIES: Record<Difficulty, EnemyDef> = {
  // 12 s per digit (~8 min) leaves ~22 HP, 16 s is risky, 20 s loses. 5 mistakes lose.
  easy: { id: 'young-dragon', name: 'Młody smok', maxHp: 228, attack: 10, attackEvery: 40, timedAttack: 4 },
  // 10 s per digit (~8 min) leaves ~18 HP, 12 s ~10 HP, 14 s usually loses. 5 mistakes lose.
  medium: { id: 'dragon', name: 'Smok', maxHp: 270, attack: 12, attackEvery: 36, timedAttack: 4 },
  // 8 s per digit (~7 min) leaves ~18 HP, 10 s ~6 HP, 12 s loses. 4 mistakes lose.
  hard: { id: 'ancient-dragon', name: 'Pradawny smok', maxHp: 300, attack: 15, attackEvery: 30, timedAttack: 4 },
};
