import { describe, expect, it } from 'vitest';
import { DESIGNS } from './art/dragonArt.ts';
import { DEFAULT_DRAGON_SKIN, DRAGON_SKINS, dragonSkin, rivalDesign } from './dragonSkins.ts';

describe('dragon skins', () => {
  it('have unique ids and designs, one free skin (the default) and rising prices', () => {
    expect(new Set(DRAGON_SKINS.map((s) => s.id)).size).toBe(DRAGON_SKINS.length);
    expect(new Set(DRAGON_SKINS.map((s) => s.design)).size).toBe(DRAGON_SKINS.length);
    expect(DRAGON_SKINS.filter((s) => s.price === 0).map((s) => s.id)).toEqual([DEFAULT_DRAGON_SKIN]);
    const prices = DRAGON_SKINS.map((s) => s.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(dragonSkin('no-such-skin').id).toBe(DEFAULT_DRAGON_SKIN);
  });

  it('ids fit the server profile (lowercase letters, digits, dashes)', () => {
    for (const skin of DRAGON_SKINS) expect(skin.id).toMatch(/^[a-z0-9-]{1,24}$/);
  });

  it('show a rival on the free skin (or an unknown one) orange, and a bought skin as it is', () => {
    expect(rivalDesign(DEFAULT_DRAGON_SKIN)).toBe(DESIGNS['duel-rival']);
    expect(rivalDesign(null)).toBe(DESIGNS['duel-rival']);
    expect(rivalDesign('from-a-newer-app')).toBe(DESIGNS['duel-rival']);
    expect(rivalDesign('king')).toBe(dragonSkin('king').design);
  });
});
