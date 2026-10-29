import { describe, expect, it } from 'vitest';
import { DEFAULT_HIT_EFFECT, HIT_EFFECTS, hitEffect } from './hitEffects.ts';

describe('hit effects', () => {
  it('have unique ids the server accepts', () => {
    expect(new Set(HIT_EFFECTS.map((e) => e.id)).size).toBe(HIT_EFFECTS.length);
    for (const effect of HIT_EFFECTS) expect(effect.id).toMatch(/^[a-z0-9-]{1,24}$/);
  });

  it('start with the one free default, then cost more and more', () => {
    expect(HIT_EFFECTS[0]).toMatchObject({ id: DEFAULT_HIT_EFFECT, price: 0 });
    for (let i = 1; i < HIT_EFFECTS.length; i++) expect(HIT_EFFECTS[i].price).toBeGreaterThan(HIT_EFFECTS[i - 1].price);
  });

  it('an unknown id is the default', () => {
    expect(hitEffect('from-the-future').id).toBe(DEFAULT_HIT_EFFECT);
    expect(hitEffect(null).id).toBe(DEFAULT_HIT_EFFECT);
    expect(hitEffect('fire').name).toBe('Ogień');
  });
});
