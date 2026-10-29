import gsap from 'gsap';
import { Container, Graphics, Text, type PointData } from 'pixi.js';
import { theme } from '../theme.ts';
import { killTweens } from './tweens.ts';

// Short-lived visual effects. Each one checks `destroyed` because the screen
// (and with it the effect layer) can be torn down while a tween is still running.

export function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => gsap.delayedCall(seconds, resolve));
}

/** A small dot that fades where it was dropped; used as an orb trail. */
function spark(layer: Container, x: number, y: number, color: number, radius: number): void {
  if (layer.destroyed) return;
  const dot = new Graphics().circle(0, 0, radius).fill(color);
  dot.position.set(x, y);
  layer.addChild(dot);
  gsap.to(dot, { alpha: 0, duration: 0.35, onComplete: () => dot.destroy() });
}

export interface OrbOptions {
  color: number;
  radius: number;
  duration: number;
  /** Sideways bend of the flight path in pixels; the sign picks the side. */
  arc: number;
}

/** Flies a glowing orb along a curve. Resolves on impact. */
export function launchOrb(layer: Container, from: PointData, to: PointData, options: OrbOptions): Promise<void> {
  const { color, radius, duration, arc } = options;
  const orb = new Graphics()
    .circle(0, 0, radius * 2)
    .fill({ color, alpha: 0.25 })
    .circle(0, 0, radius)
    .fill(color)
    .circle(0, 0, radius * 0.45)
    .fill(0xffffff);
  orb.position.copyFrom(from);
  layer.addChild(orb);

  // Quadratic Bézier with the control point pushed sideways from the midpoint.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const control = { x: (from.x + to.x) / 2 - (dy / length) * arc, y: (from.y + to.y) / 2 + (dx / length) * arc };

  const progress = { t: 0 };
  let lastTrail = 0;
  return new Promise((resolve) => {
    const tween = gsap.to(progress, {
      t: 1,
      duration,
      ease: 'power1.in',
      onUpdate: () => {
        if (orb.destroyed) {
          tween.kill();
          resolve();
          return;
        }
        const t = progress.t;
        const u = 1 - t;
        const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
        const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
        orb.position.set(x, y);
        if (t - lastTrail > 0.05) {
          lastTrail = t;
          spark(layer, x, y, color, radius * 0.6);
        }
      },
      onComplete: () => {
        if (!orb.destroyed) orb.destroy();
        resolve();
      },
    });
  });
}

/** Particles flying outward from a point. */
export function burst(layer: Container, at: PointData, color: number, count: number): void {
  if (layer.destroyed) return;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 25 + Math.random() * 45;
    const dot = new Graphics().circle(0, 0, 2 + Math.random() * 3).fill(color);
    dot.position.copyFrom(at);
    layer.addChild(dot);
    gsap.to(dot, {
      x: at.x + Math.cos(angle) * distance,
      y: at.y + Math.sin(angle) * distance,
      alpha: 0,
      duration: 0.5 + Math.random() * 0.25,
      ease: 'power2.out',
      onComplete: () => dot.destroy(),
    });
  }
}

/** Text that pops in, floats up and fades: damage numbers, combo callouts. */
export function floatText(
  layer: Container,
  text: string,
  at: PointData,
  style: { color: number; fontSize: number },
): void {
  if (layer.destroyed) return;
  const label = new Text({
    text,
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '800',
      fontSize: style.fontSize,
      fill: style.color,
      stroke: { color: theme.panelLip, width: 5, join: 'round' },
    },
  });
  label.anchor.set(0.5);
  label.position.copyFrom(at);
  label.scale.set(0.3);
  layer.addChild(label);
  gsap
    .timeline({ onComplete: () => label.destroy() })
    .to(label.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' })
    .to(label, { y: at.y - 60, alpha: 0, duration: 0.9, ease: 'power1.in' }, 0.3);
}

const shakeState = new WeakMap<Container, { x: number; y: number; active: number }>();

/** Jitters a container around its resting position. Overlapping shakes are safe. */
export function shake(target: Container, strength: number, duration: number): void {
  const state = shakeState.get(target) ?? { x: target.x, y: target.y, active: 0 };
  state.active++;
  shakeState.set(target, state);

  const power = { k: 1 };
  gsap.to(power, {
    k: 0,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      if (target.destroyed) return;
      target.position.set(
        state.x + (Math.random() * 2 - 1) * strength * power.k,
        state.y + (Math.random() * 2 - 1) * strength * power.k,
      );
    },
    onComplete: () => {
      state.active--;
      if (state.active > 0) return;
      shakeState.delete(target);
      if (!target.destroyed) target.position.set(state.x, state.y);
    },
  });
}

/** Kills running tweens on every effect currently in the layer. Call before destroying it. */
export function stopEffects(layer: Container): void {
  for (const child of layer.children) killTweens(child, child.scale);
}
