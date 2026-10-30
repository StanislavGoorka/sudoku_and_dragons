import type { EnemyDef, Stage } from '../core/index.ts';
import { DESIGNS, type DragonDesign } from './art/dragonArt.ts';
import { SCENES, type SceneLook } from './ui/Scene.ts';

/** How an enemy looks and where it is fought. */
export interface EnemyLook {
  design: DragonDesign;
  scene: SceneLook;
}

/** A plain enemy (the daily challenge's, one per difficulty): its design and scene share its id. */
export function designOf(enemy: EnemyDef): DragonDesign {
  return DESIGNS[enemy.id] ?? DESIGNS.dragon;
}

/** A campaign stage looks like its design, over its region's scene; any other enemy, by its id. */
export function lookOf(enemy: EnemyDef, stage?: Stage): EnemyLook {
  if (stage) return { design: DESIGNS[stage.design] ?? DESIGNS.dragon, scene: SCENES[stage.region.scene] ?? SCENES.dragon };
  return { design: designOf(enemy), scene: SCENES[enemy.id] ?? SCENES.dragon };
}
