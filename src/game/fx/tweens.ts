import gsap from 'gsap';

/**
 * Kills every tween of each target. Always use this instead of `gsap.killTweensOf([a, b])`:
 * with an array, GSAP only kills a not-yet-started tween (one with a delay, or later in a
 * timeline) if its targets match the whole array, so a tween of just `a` survives. When it
 * finally starts on the destroyed Pixi object it throws on every frame and stalls all of GSAP.
 */
export function killTweens(...targets: object[]): void {
  for (const target of targets) gsap.killTweensOf(target);
}
