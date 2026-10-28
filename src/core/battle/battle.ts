import type { MoveResult } from '../sudoku/moves.ts';

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  /** Damage dealt to the player for each wrong digit. */
  attack: number;
  /** Seconds it takes the enemy to charge a timed attack. */
  attackEvery: number;
  /** Damage of a timed attack. */
  timedAttack: number;
}

export const DRAGON: EnemyDef = {
  id: 'dragon',
  name: 'Smok',
  maxHp: 460,
  attack: 10,
  // Tuned by simulation (no mistakes, easy board): ~8 s per digit costs ~16 HP,
  // ~12 s per digit ~28 HP, 16 s gets risky, 20 s loses.
  attackEvery: 40,
  timedAttack: 4,
};

export const PLAYER_MAX_HP = 50;

export const DAMAGE = {
  /** Every correct digit. */
  cell: 2,
  /** Every row, column or box the digit completes. */
  unit: 12,
} as const;

/** Bonus for completing several units with one digit, indexed by the number of units. */
export const COMBO_MULTIPLIER = [1, 1, 1.25, 1.5] as const;

/** Seconds of charge a correct digit takes away from the enemy's timed attack. */
export const KNOCKBACK = {
  cell: 2,
  /** Extra, per completed row, column or box. */
  unit: 5,
} as const;

export type Outcome = 'ongoing' | 'won' | 'lost';

export interface Battle {
  readonly enemy: EnemyDef;
  readonly playerMaxHp: number;
  enemyHp: number;
  playerHp: number;
  /** Seconds the enemy has charged towards its next timed attack (0 to `enemy.attackEvery`). */
  charge: number;
  outcome: Outcome;
}

export interface Hit {
  target: 'enemy' | 'player';
  /** A correct digit, a wrong digit, or the enemy's timed attack. */
  cause: 'digit' | 'mistake' | 'timer';
  damage: number;
  /** Units the move completed; 2 or more is a combo. */
  units: number;
  /** The move solved the board, which deals all of the enemy's remaining HP. */
  finisher: boolean;
  /** Target HP after the hit. */
  hpAfter: number;
}

export function createBattle(enemy: EnemyDef, playerMaxHp = PLAYER_MAX_HP): Battle {
  return { enemy, playerMaxHp, enemyHp: enemy.maxHp, playerHp: playerMaxHp, charge: 0, outcome: 'ongoing' };
}

/** Damage of a correct digit that completed `units` rows/columns/boxes (0–3). */
export function moveDamage(units: number): number {
  return DAMAGE.cell + Math.round(DAMAGE.unit * units * COMBO_MULTIPLIER[units]);
}

/** Seconds of charge removed by a correct digit that completed `units` units. */
export function moveKnockback(units: number): number {
  return KNOCKBACK.cell + KNOCKBACK.unit * units;
}

function hitPlayer(battle: Battle, damage: number, cause: 'mistake' | 'timer'): Hit {
  const dealt = Math.min(damage, battle.playerHp);
  battle.playerHp -= dealt;
  if (battle.playerHp === 0) battle.outcome = 'lost';
  return { target: 'player', cause, damage: dealt, units: 0, finisher: false, hpAfter: battle.playerHp };
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

    case 'wrong':
      return hitPlayer(battle, battle.enemy.attack, 'mistake');

    case 'correct': {
      const units = move.completed.length;
      const damage = move.solved ? battle.enemyHp : Math.min(moveDamage(units), battle.enemyHp);
      battle.enemyHp -= damage;
      battle.charge = Math.max(0, battle.charge - moveKnockback(units));
      if (battle.enemyHp === 0) battle.outcome = 'won';
      return { target: 'enemy', cause: 'digit', damage, units, finisher: move.solved, hpAfter: battle.enemyHp };
    }
  }
}

/**
 * Lets `seconds` pass. Returns the enemy's timed attack when its charge fills up.
 * Call it every frame with the frame time; a step longer than `attackEvery` still yields one attack.
 */
export function advanceTime(battle: Battle, seconds: number): Hit | null {
  if (battle.outcome !== 'ongoing') return null;
  battle.charge += seconds;
  if (battle.charge < battle.enemy.attackEvery) return null;
  battle.charge = 0;
  return hitPlayer(battle, battle.enemy.timedAttack, 'timer');
}
