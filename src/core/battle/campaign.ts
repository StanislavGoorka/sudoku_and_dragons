import type { Difficulty } from '../sudoku/generator.ts';
import type { EnemyDef } from './battle.ts';
import { ENEMIES } from './enemies.ts';

/**
 * The campaign: three regions, one per board difficulty, each with three dragons and a boss. They are
 * fought in order; each win opens the next stage, and a region's boss opens the next region. Within a
 * region the dragons charge their timed attack faster and hit harder for mistakes; a boss also has more
 * HP. Every stage is tuned with `npm run sim:campaign` (see enemies.ts for what the numbers mean).
 * `design` and a region's `scene` name the looks in the game (art/dragonArt.ts, ui/Scene.ts).
 */
export interface Region {
  id: string;
  /** Polish, shown on the map and the menu. */
  name: string;
  difficulty: Difficulty;
  scene: string;
  stages: Stage[];
}

export interface Stage {
  /** Saved in the player's progress: never change one. */
  id: string;
  region: Region;
  /** 1-based, within its region. */
  number: number;
  boss: boolean;
  enemy: EnemyDef;
  design: string;
}

type StageSpec = Pick<Stage, 'id' | 'enemy' | 'design'> & { boss?: boolean };

function region(id: string, name: string, difficulty: Difficulty, scene: string, specs: StageSpec[]): Region {
  const made: Region = { id, name, difficulty, scene, stages: [] };
  made.stages = specs.map((spec, i) => ({ boss: false, ...spec, region: made, number: i + 1 }));
  return made;
}

const enemy = (id: string, name: string, maxHp: number, attack: number, attackEvery: number, timedAttack: number): EnemyDef => ({
  id,
  name,
  maxHp,
  attack,
  attackEvery,
  timedAttack,
});

export const REGIONS: Region[] = [
  region('valley', 'Zielona Dolina', 'easy', 'young-dragon', [
    { id: 'valley-1', enemy: ENEMIES.easy, design: 'young-dragon' },
    { id: 'valley-2', enemy: enemy('valley-2', 'Szmaragdowy smok', 228, 10, 39, 4), design: 'skin-emerald' },
    { id: 'valley-3', enemy: enemy('valley-3', 'Lodowy smok', 228, 11, 38, 4), design: 'skin-frost' },
    { id: 'valley-boss', enemy: { ...enemy('valley-boss', 'Strażnik Doliny', 240, 12, 42, 5), pattern: 'rage' }, design: 'boss-valley', boss: true },
  ]),
  region('peaks', 'Ogniste Szczyty', 'medium', 'dragon', [
    { id: 'peaks-1', enemy: ENEMIES.medium, design: 'dragon' },
    { id: 'peaks-2', enemy: enemy('peaks-2', 'Płomienny smok', 270, 12, 35, 4), design: 'duel-rival' },
    { id: 'peaks-3', enemy: enemy('peaks-3', 'Magmowy smok', 270, 13, 34, 4), design: 'skin-magma' },
    { id: 'peaks-boss', enemy: { ...enemy('peaks-boss', 'Władca Wulkanu', 285, 14, 38, 5), pattern: 'heavy' }, design: 'boss-volcano', boss: true },
  ]),
  region('ruins', 'Księżycowe Ruiny', 'hard', 'ancient-dragon', [
    { id: 'ruins-1', enemy: enemy('ruins-1', 'Smok Cienia', 300, 15, 30, 4), design: 'skin-shadow' },
    { id: 'ruins-2', enemy: enemy('ruins-2', 'Burzowy smok', 300, 15, 29, 4), design: 'enemy-storm' },
    { id: 'ruins-3', enemy: enemy('ruins-3', 'Kościany smok', 300, 16, 28, 4), design: 'enemy-bone' },
    { id: 'ruins-boss', enemy: { ...ENEMIES.hard, id: 'ruins-boss', maxHp: 315, attack: 17, attackEvery: 35, timedAttack: 5, pattern: 'relentless' }, design: 'ancient-dragon', boss: true },
  ]),
];

/** Every stage in the order they are fought. */
export const STAGES: Stage[] = REGIONS.flatMap((r) => r.stages);

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

/** The stage after `stage`, or null after the last boss. */
export function nextStage(stage: Stage): Stage | null {
  return STAGES[STAGES.indexOf(stage) + 1] ?? null;
}
