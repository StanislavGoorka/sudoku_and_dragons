import { describe, expect, it } from 'vitest';
import { DESIGNS, dragonParts, dragonSvg, type PartName } from './dragonArt.ts';

// DragonView animates these by name.
const ANIMATED: PartName[] = ['shadow', 'wingBack', 'tail', 'wingFront', 'body', 'head', 'mouth', 'jaw', 'skull', 'eye', 'brow'];

describe('dragon art', () => {
  for (const [id, design] of Object.entries(DESIGNS)) {
    it(`${id} has every part DragonView moves, head pieces on the head`, () => {
      const parts = dragonParts(design);
      expect(parts.map((part) => part.name).sort()).toEqual([...ANIMATED].sort());
      for (const name of ['mouth', 'jaw', 'skull', 'eye', 'brow'] as const) {
        expect(parts.find((part) => part.name === name)?.parent).toBe('head');
      }
    });

    it(`${id} is drawn with plain path data`, () => {
      for (const part of dragonParts(design)) {
        for (const shape of part.shapes) {
          expect(shape.d).toMatch(/^[MLCQZ\d\s.-]+$/);
          expect(shape.fill !== undefined || shape.stroke !== undefined).toBe(true);
        }
      }
      expect(dragonSvg(design)).not.toContain('NaN');
    });
  }

  it('the enemies, both duel sides and the skins have a design', () => {
    expect(Object.keys(DESIGNS).sort()).toEqual([
      'ancient-dragon',
      'dragon',
      'duel-mine',
      'duel-rival',
      'skin-candy',
      'skin-emerald',
      'skin-frost',
      'skin-king',
      'skin-magma',
      'skin-shadow',
      'young-dragon',
    ]);
  });
});
