import { DESIGNS, type DragonDesign } from './art/dragonArt.ts';

export interface DragonSkin {
  id: string;
  /** Polish, shown in the shop. */
  name: string;
  /** Stars to buy it; 0 for the one everyone has. */
  price: number;
  /** How the player's dragon looks in duels, to them and to their rivals. */
  design: DragonDesign;
}

export const DEFAULT_DRAGON_SKIN = 'azure';

/**
 * Looks for the player's dragon in duels, bought with stars, cheapest first. The rival sees them too
 * (the server keeps each player's skin in their profile). Designs live in art/dragonArt.ts.
 */
export const DRAGON_SKINS: DragonSkin[] = [
  { id: 'azure', name: 'Lazur', price: 0, design: DESIGNS['duel-mine'] },
  { id: 'emerald', name: 'Szmaragd', price: 20, design: DESIGNS['skin-emerald'] },
  { id: 'candy', name: 'Pianka', price: 30, design: DESIGNS['skin-candy'] },
  { id: 'frost', name: 'Szron', price: 40, design: DESIGNS['skin-frost'] },
  { id: 'shadow', name: 'Cień', price: 55, design: DESIGNS['skin-shadow'] },
  { id: 'magma', name: 'Magma', price: 70, design: DESIGNS['skin-magma'] },
  { id: 'king', name: 'Król', price: 100, design: DESIGNS['skin-king'] },
];

export function dragonSkin(id: string): DragonSkin {
  return DRAGON_SKINS.find((skin) => skin.id === id) ?? DRAGON_SKINS[0];
}

/**
 * The rival's dragon as you see it. A rival on the free skin is shown orange, so two players who
 * bought nothing still tell their dragons apart; an unknown id (a skin newer than this app) too.
 */
export function rivalDesign(skinId: string | null): DragonDesign {
  const skin = DRAGON_SKINS.find((s) => s.id === skinId);
  return !skin || skin.price === 0 ? DESIGNS['duel-rival'] : skin.design;
}
