import type { EnemyDef } from '../core/index.ts';
import { DEFAULT_LOOK, type DragonLook } from './ui/DragonView.ts';

/** Placeholder looks, keyed by enemy id: the young dragon is small, the ancient one dark and large. */
const LOOKS: Record<string, DragonLook> = {
  'young-dragon': { emoji: '🐉', tint: 0xffffff, scale: 0.75 },
  dragon: { emoji: '🐉', tint: 0xffa08c, scale: 0.95 },
  'ancient-dragon': { emoji: '🐲', tint: 0xc9a6ff, scale: 1 },
};

export function lookOf(enemy: EnemyDef): DragonLook {
  return LOOKS[enemy.id] ?? DEFAULT_LOOK;
}
