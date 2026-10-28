import type { MoveResult } from '../sudoku/moves.ts';

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  /** Damage dealt to the player for each wrong digit. */
  attack: number;
}

export const DRAGON: EnemyDef = { id: 'dragon', name: 'Smok', maxHp: 460, attack: 10 };

export const PLAYER_MAX_HP = 50;

export const DAMAGE = {
  /** Every correct digit. */
  cell: 2,
  /** Every row, column or box the digit completes. */
  unit: 12,
} as const;

/** Bonus for completing several units with one digit, indexed by the number of units. */
export const COMBO_MULTIPLIER = [1, 1, 1.25, 1.5] as const;

export type Outcome = 'ongoing' | 'won' | 'lost';

export interface Battle {
  readonly enemy: EnemyDef;
  readonly playerMaxHp: number;
  enemyHp: number;
  playerHp: number;
  outcome: Outcome;
}

export interface Hit {
  target: 'enemy' | 'player';
  damage: number;
  /** Units the move completed; 2 or more is a combo. */
  units: number;
  /** The move solved the board, which deals all of the enemy's remaining HP. */
  finisher: boolean;
  /** Target HP after the hit. */
  hpAfter: number;
}

export function createBattle(enemy: EnemyDef, playerMaxHp = PLAYER_MAX_HP): Battle {
  return { enemy, playerMaxHp, enemyHp: enemy.maxHp, playerHp: playerMaxHp, outcome: 'ongoing' };
}

/** Damage of a correct digit that completed `units` rows/columns/boxes (0–3). */
export function moveDamage(units: number): number {
  return DAMAGE.cell + Math.round(DAMAGE.unit * units * COMBO_MULTIPLIER[units]);
}

/**
 * Turns a sudoku move into a hit and applies it to `battle`.
 * Returns null when the move does nothing or the battle is already over.
 */
export function resolveMove(battle: Battle, move: MoveResult): Hit | null {
  if (battle.outcome !== 'ongoing') return null;

  switch (move.kind) {
    case 'occupied':
      return null;

    case 'wrong': {
      const damage = Math.min(battle.enemy.attack, battle.playerHp);
      battle.playerHp -= damage;
      if (battle.playerHp === 0) battle.outcome = 'lost';
      return { target: 'player', damage, units: 0, finisher: false, hpAfter: battle.playerHp };
    }

    case 'correct': {
      const units = move.completed.length;
      const damage = move.solved ? battle.enemyHp : Math.min(moveDamage(units), battle.enemyHp);
      battle.enemyHp -= damage;
      if (battle.enemyHp === 0) battle.outcome = 'won';
      return { target: 'enemy', damage, units, finisher: move.solved, hpAfter: battle.enemyHp };
    }
  }
}
