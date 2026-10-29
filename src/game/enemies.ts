import type { EnemyDef } from '../core/index.ts';
import { DESIGNS, type DragonDesign } from './art/dragonArt.ts';

/** How each enemy looks: its design in art/dragonArt.ts, keyed by enemy id. */
export function designOf(enemy: EnemyDef): DragonDesign {
  return DESIGNS[enemy.id] ?? DESIGNS.dragon;
}
