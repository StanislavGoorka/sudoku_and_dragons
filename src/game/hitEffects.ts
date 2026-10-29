export interface HitEffect {
  id: string;
  /** Polish, shown in the shop. */
  name: string;
  /** Stars to buy it; 0 for the one everyone has. */
  price: number;
}

export const DEFAULT_HIT_EFFECT = 'sparks';

/**
 * How your hits fly from the board to the dragon you attack, bought with stars, cheapest (and plainest)
 * first. Rivals see yours in duels (the server keeps it in your profile). Drawn by fx/hitEffects.ts.
 */
export const HIT_EFFECTS: HitEffect[] = [
  { id: 'sparks', name: 'Iskry', price: 0 },
  { id: 'stars', name: 'Gwiazdki', price: 15 },
  { id: 'frost', name: 'Szron', price: 30 },
  { id: 'fire', name: 'Ogień', price: 45 },
  { id: 'lightning', name: 'Piorun', price: 60 },
  { id: 'meteor', name: 'Meteor', price: 80 },
  { id: 'rainbow', name: 'Tęcza', price: 110 },
];

/** The effect with this id; an unknown one (newer than this app) is the default. */
export function hitEffect(id: string | null): HitEffect {
  return HIT_EFFECTS.find((effect) => effect.id === id) ?? HIT_EFFECTS[0];
}
