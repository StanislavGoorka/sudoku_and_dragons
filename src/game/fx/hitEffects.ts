import gsap from 'gsap';
import { Container, Graphics, type PointData } from 'pixi.js';
import { DEFAULT_HIT_EFFECT } from '../hitEffects.ts';
import { burst, launchOrb, wait } from './effects.ts';

// The hit effects (cosmetics, see hitEffects.ts): what flies from the board to the dragon you attack,
// and what happens where it lands. The default is the plain orb of effects.ts in your digit colour;
// the bought ones get fancier with the price. Like every effect, each piece is a direct child of the
// layer with tweens only on itself and its scale (so stopEffects can kill them), and anything driven
// by a proxy tween checks `destroyed` itself.

export interface Shot {
  from: PointData;
  to: PointData;
  /** A completed row, column or box: a bigger shot. */
  big: boolean;
  /** The digit's colour; the default effect is drawn in it. */
  color: number;
  /** Which way the path bends: -1 or 1. */
  side: number;
}

type Player = (layer: Container, shot: Shot) => Promise<void>;

/** Plays `effect` (an id from HIT_EFFECTS; unknown ones play the default). Resolves at impact; debris lingers. */
export function fireShot(layer: Container, effect: string, shot: Shot): Promise<void> {
  if (layer.destroyed) return Promise.resolve();
  return (PLAYERS[effect] ?? PLAYERS[DEFAULT_HIT_EFFECT])(layer, shot);
}

/** A rainbow colour: `h` in degrees. */
function hue(h: number, saturation = 0.7): number {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 1 - saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Where a moving piece ends up and how it gets there; it fades out on the way and is then removed. */
interface Drift {
  x: number;
  y: number;
  duration: number;
  delay?: number;
  scale?: number;
  /** The turn it starts at. */
  heading?: number;
  /** How far it turns on the way. */
  rotation?: number;
  /** Alpha at the end (0 by default). */
  alpha?: number;
  ease?: string;
  /** The vertical ease, if it differs: 'back.in' throws a piece up a little before it falls. */
  yEase?: string;
}

/** A short-lived piece: drawn by `draw` around (0, 0), placed at `at`, drifting as `to` says. */
function mote(layer: Container, at: PointData, draw: (g: Graphics) => void, to: Drift): Graphics | null {
  if (layer.destroyed) return null;
  const g = new Graphics();
  draw(g);
  g.position.copyFrom(at);
  g.rotation = to.heading ?? 0;
  layer.addChild(g);
  const { duration, delay = 0, ease = 'power2.out' } = to;
  gsap.to(g, { x: to.x, duration, delay, ease });
  gsap.to(g, { y: to.y, duration, delay, ease: to.yEase ?? ease });
  gsap.to(g, {
    alpha: to.alpha ?? 0,
    rotation: g.rotation + (to.rotation ?? 0),
    duration,
    delay,
    ease: 'power1.in',
    onComplete: () => g.destroy(),
  });
  if (to.scale !== undefined) gsap.to(g.scale, { x: to.scale, y: to.scale, duration, delay, ease });
  return g;
}

/** A piece that stays put and grows or shrinks as it fades (flashes, rings, puffs). */
function pulse(layer: Container, at: PointData, draw: (g: Graphics) => void, from: number, to: number, duration: number, delay = 0): void {
  const g = mote(layer, at, draw, { x: at.x, y: at.y, duration, delay, scale: to, ease: 'power2.out' });
  g?.scale.set(from);
}

/** A ring of `count` pieces flying outward from `at`, `distance` px give or take. */
function scatter(layer: Container, at: PointData, count: number, distance: [number, number], piece: (g: Graphics, i: number) => void, extra: Partial<Drift> = {}): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
    const d = rand(...distance);
    // Pieces point the way they fly, unless they spin.
    mote(layer, at, (g) => piece(g, i), {
      x: at.x + Math.cos(angle) * d,
      y: at.y + Math.sin(angle) * d,
      duration: rand(0.45, 0.7),
      heading: extra.rotation === undefined ? angle : 0,
      ...extra,
    });
  }
}

interface Path {
  duration: number;
  ease?: string;
  /** The curve's middle point; by default pushed sideways from the straight line by `arc`. */
  control?: PointData;
  arc?: number;
}

/** Moves along a quadratic curve from shot.from to shot.to, calling `step` with the place, heading and progress. */
function fly(layer: Container, shot: Shot, path: Path, step: (x: number, y: number, heading: number, t: number) => void): Promise<void> {
  const { from, to } = shot;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const arc = path.arc ?? 0;
  const control = path.control ?? { x: (from.x + to.x) / 2 - (dy / length) * arc, y: (from.y + to.y) / 2 + (dx / length) * arc };
  const progress = { t: 0 };
  return new Promise((resolve) => {
    const tween = gsap.to(progress, {
      t: 1,
      duration: path.duration,
      ease: path.ease ?? 'power1.in',
      onUpdate: () => {
        if (layer.destroyed) {
          tween.kill();
          resolve();
          return;
        }
        const t = progress.t;
        const u = 1 - t;
        const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
        const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
        // Heading: the curve's derivative.
        const hx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x);
        const hy = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y);
        step(x, y, Math.atan2(hy, hx), t);
      },
      onComplete: () => resolve(),
    });
  });
}

/** A head that rides the path; removed at impact. */
function head(layer: Container, draw: (g: Graphics) => void): Graphics {
  const g = new Graphics();
  draw(g);
  g.position.set(-9999, -9999);
  layer.addChild(g);
  return g;
}

function drop(g: Graphics): void {
  if (!g.destroyed) g.destroy();
}

// ---- Shapes, shared by the flying effects and the shop's icons ----

const GOLD = 0xffd94a;
const ICE = 0xc8f3ff;
const ICE_DEEP = 0x3fb6f2;
const FLAME = [0xff3d1f, 0xff8a1f, 0xffc23d];
const ROCK = 0x5e4034;
const ROCK_EDGE = 0x2e1d18;
const BOLT_GLOW = 0x8fd8ff;

export function drawStarShape(g: Graphics, r: number): Graphics {
  return g.star(0, 0, 5, r, r * 0.48).fill(GOLD).stroke({ width: Math.max(1.5, r * 0.18), color: 0xffffff, join: 'round' });
}

/** An ice shard pointing along +x. */
export function drawShard(g: Graphics, length: number, width: number): Graphics {
  return g
    .poly([length, 0, 0, width, -length * 0.65, 0, 0, -width])
    .fill(ICE)
    .stroke({ width: 1.5, color: ICE_DEEP, join: 'round' })
    .moveTo(-length * 0.4, 0)
    .lineTo(length * 0.7, 0)
    .stroke({ width: 1.2, color: 0xffffff, alpha: 0.9 });
}

export function drawFireball(g: Graphics, r: number): Graphics {
  return g
    .circle(0, 0, r * 1.9)
    .fill({ color: FLAME[0], alpha: 0.3 })
    .circle(0, 0, r * 1.35)
    .fill(FLAME[1])
    .circle(0, 0, r)
    .fill(FLAME[2])
    .circle(0, 0, r * 0.45)
    .fill(0xfff6d8);
}

/** A lumpy rock with a fiery rim; `seed` keeps its shape the same from frame to frame. */
export function drawRock(g: Graphics, r: number, seed = 1): Graphics {
  const points: number[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const bump = 0.78 + 0.22 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233));
    points.push(Math.cos(angle) * r * bump, Math.sin(angle) * r * bump);
  }
  return g
    .circle(0, 0, r * 1.7)
    .fill({ color: FLAME[1], alpha: 0.35 })
    .poly(points)
    .fill(ROCK)
    .stroke({ width: Math.max(1.5, r * 0.2), color: ROCK_EDGE, join: 'round' })
    .circle(r * 0.25, -r * 0.2, r * 0.22)
    .fill(ROCK_EDGE)
    .circle(-r * 0.3, r * 0.25, r * 0.14)
    .fill(ROCK_EDGE);
}

export function drawComet(g: Graphics, r: number, h: number): Graphics {
  return g
    .circle(0, 0, r * 1.8)
    .fill({ color: hue(h, 0.8), alpha: 0.45 })
    .circle(0, 0, r * 1.15)
    .fill(hue(h + 40, 0.45))
    .circle(0, 0, r * 0.6)
    .fill(0xffffff);
}

/** A four-pointed twinkle. */
export function drawSparkle(g: Graphics, r: number, color = 0xffffff): Graphics {
  return g.star(0, 0, 4, r, r * 0.28).fill(color);
}

/** A zigzag from `a` to `b`, `amplitude` px off the straight line at most. */
function jagged(a: PointData, b: PointData, segments: number, amplitude: number, rng: () => number = Math.random): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const points = [a.x, a.y];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Calmer near both ends, so the bolt leaves the board and hits the dragon squarely.
    const off = (rng() * 2 - 1) * amplitude * Math.sin(t * Math.PI);
    points.push(a.x + dx * t + nx * off, a.y + dy * t + ny * off);
  }
  points.push(b.x, b.y);
  return points;
}

export function drawBolt(g: Graphics, points: number[], width: number): Graphics {
  return g
    .poly(points, false)
    .stroke({ width: width * 3.2, color: BOLT_GLOW, alpha: 0.35, join: 'round', cap: 'round' })
    .poly(points, false)
    .stroke({ width, color: 0xffffff, join: 'round', cap: 'round' });
}

// ---- The effects ----

const PLAYERS: Record<string, Player> = {
  /** The default: a glowing orb in the digit's colour, a dotted trail and a puff of dots. */
  async sparks(layer, shot) {
    await launchOrb(layer, shot.from, shot.to, {
      color: shot.color,
      radius: shot.big ? 9 : 5,
      duration: shot.big ? 0.5 : 0.35,
      arc: shot.side * rand(30, 80),
    });
    burst(layer, shot.to, shot.color, shot.big ? 14 : 6);
  },

  /** A spinning gold star dropping little stars, bursting into a ring of them. */
  async stars(layer, shot) {
    const r = shot.big ? 17 : 11;
    const star = head(layer, (g) => drawStarShape(g, r));
    let last = 0;
    await fly(layer, shot, { duration: shot.big ? 0.5 : 0.38, arc: shot.side * rand(30, 70) }, (x, y, _heading, t) => {
      star.position.set(x, y);
      star.rotation = t * 9;
      if (t - last < 0.07) return;
      last = t;
      mote(layer, { x, y }, (g) => drawStarShape(g, r * 0.4), { x: x + rand(-6, 6), y: y + 10, duration: 0.45, scale: 0.3, rotation: 3 });
    });
    drop(star);
    pulse(layer, shot.to, (g) => g.circle(0, 0, r * 1.6).fill({ color: 0xffffff, alpha: 0.8 }), 0.3, 1.4, 0.25);
    scatter(layer, shot.to, shot.big ? 12 : 7, [30, shot.big ? 80 : 60], (g) => drawStarShape(g, rand(3.5, 6.5)), {
      rotation: rand(-5, 5),
      scale: 0.5,
    });
  },

  /** An ice shard, straight and fast, leaving frost; it shatters in a cold ring. */
  async frost(layer, shot) {
    const length = shot.big ? 23 : 15;
    const width = shot.big ? 9 : 6;
    const shard = head(layer, (g) => drawShard(g, length, width));
    let last = 0;
    await fly(layer, shot, { duration: shot.big ? 0.42 : 0.3, ease: 'power2.in', arc: shot.side * rand(8, 25) }, (x, y, heading, t) => {
      shard.position.set(x, y);
      shard.rotation = heading;
      if (t - last < 0.05) return;
      last = t;
      mote(layer, { x, y }, (g) => g.star(0, 0, 4, rand(3, 5), 1.4).fill(ICE), {
        x: x + rand(-8, 8),
        y: y + rand(4, 14),
        duration: 0.5,
        rotation: rand(-2, 2),
      });
    });
    drop(shard);
    const ring = shot.big ? 50 : 32;
    pulse(layer, shot.to, (g) => g.circle(0, 0, ring).stroke({ width: 4, color: ICE_DEEP }), 0.2, 1, 0.4);
    pulse(layer, shot.to, (g) => g.circle(0, 0, ring * 0.7).fill({ color: ICE, alpha: 0.6 }), 0.3, 1, 0.3);
    scatter(layer, shot.to, shot.big ? 10 : 6, [25, shot.big ? 65 : 45], (g) => drawShard(g, rand(5, 8), rand(2, 3)));
  },

  /** A fireball trailing flames; it explodes in a flash, embers and smoke. */
  async fire(layer, shot) {
    const r = shot.big ? 13 : 8.5;
    const ball = head(layer, (g) => drawFireball(g, r));
    let last = 0;
    await fly(layer, shot, { duration: shot.big ? 0.5 : 0.38, arc: shot.side * rand(25, 60) }, (x, y, _heading, t) => {
      ball.position.set(x, y);
      ball.scale.set(rand(0.9, 1.12));
      if (t - last < 0.025) return;
      last = t;
      const color = FLAME[Math.floor(Math.random() * FLAME.length)];
      mote(layer, { x: x + rand(-2, 2), y: y + rand(-2, 2) }, (g) => g.circle(0, 0, r * rand(0.6, 0.95)).fill(color), {
        x: x + rand(-4, 4),
        y: y - rand(8, 16),
        duration: 0.35,
        scale: 0.2,
      });
    });
    drop(ball);
    const blast = shot.big ? 36 : 24;
    pulse(layer, shot.to, (g) => g.circle(0, 0, blast).fill({ color: FLAME[2], alpha: 0.9 }), 0.2, 1, 0.3);
    pulse(layer, shot.to, (g) => g.circle(0, 0, blast * 1.25).stroke({ width: 5, color: FLAME[1] }), 0.3, 1, 0.4, 0.05);
    scatter(layer, shot.to, shot.big ? 14 : 8, [30, shot.big ? 80 : 55], (g, i) => g.circle(0, 0, rand(2, 4)).fill(FLAME[i % 3]), {
      yEase: 'back.in(2)',
    });
    for (let i = 0; i < (shot.big ? 4 : 2); i++) {
      const at = { x: shot.to.x + rand(-14, 14), y: shot.to.y + rand(-8, 8) };
      mote(layer, at, (g) => g.circle(0, 0, rand(6, 10)).fill({ color: 0x4a3a66, alpha: 0.55 }), {
        x: at.x + rand(-8, 8),
        y: at.y - rand(25, 40),
        duration: 0.8,
        delay: 0.08,
        scale: 1.8,
      });
    }
  },

  /** A spark gathers on the board, then a lightning bolt strikes the dragon at once and flickers out. */
  async lightning(layer, shot) {
    const { from, to, big } = shot;
    pulse(layer, from, (g) => g.circle(0, 0, big ? 12 : 8).fill({ color: BOLT_GLOW, alpha: 0.9 }), 0.2, 1.2, 0.22);
    await wait(0.12);
    if (layer.destroyed) return;
    const bolt = new Graphics();
    layer.addChild(bolt);
    const width = big ? 3.6 : 2.4;
    const amplitude = big ? 24 : 16;
    const strike = () => {
      if (bolt.destroyed) return;
      bolt.clear();
      const points = jagged(from, to, 9, amplitude);
      drawBolt(bolt, points, width);
      // A branch or two off the main bolt.
      for (let b = 0; b < (big ? 2 : 1); b++) {
        const i = 2 * (2 + Math.floor(Math.random() * 5));
        const start = { x: points[i], y: points[i + 1] };
        const angle = Math.atan2(to.y - from.y, to.x - from.x) + rand(-1, 1);
        const end = { x: start.x + Math.cos(angle) * rand(20, 40), y: start.y + Math.sin(angle) * rand(20, 40) };
        drawBolt(bolt, jagged(start, end, 4, 6), width * 0.6);
      }
    };
    strike();
    gsap.delayedCall(0.06, strike);
    gsap.delayedCall(0.12, strike);
    gsap.to(bolt, { alpha: 0, duration: 0.22, delay: 0.16, onComplete: () => drop(bolt) });
    pulse(layer, to, (g) => g.circle(0, 0, big ? 32 : 22).fill({ color: 0xffffff, alpha: 0.95 }), 0.3, 1.3, 0.25);
    pulse(layer, to, (g) => g.circle(0, 0, big ? 44 : 30).stroke({ width: 3, color: BOLT_GLOW }), 0.3, 1, 0.35);
    scatter(layer, to, big ? 10 : 6, [25, big ? 65 : 45], (g) => g.moveTo(-5, 0).lineTo(1, -2).lineTo(-1, 2).lineTo(6, 0).stroke({ width: 2, color: 0xffffff }), {
      duration: 0.3,
    });
  },

  /** A burning rock thrown high from the board, crashing down on the dragon in a shockwave of debris. */
  async meteor(layer, shot) {
    const { from, to, big } = shot;
    const r = big ? 14 : 10;
    const seed = Math.random() * 100;
    const rock = head(layer, (g) => drawRock(g, r, seed));
    const control = { x: (from.x + to.x) / 2 + shot.side * 30, y: Math.min(from.y, to.y) - (big ? 170 : 130) };
    let last = 0;
    await fly(layer, shot, { duration: big ? 0.62 : 0.5, control }, (x, y, _heading, t) => {
      rock.position.set(x, y);
      rock.rotation = t * 6;
      if (t - last < 0.02) return;
      last = t;
      mote(layer, { x, y }, (g) => g.circle(0, 0, r * 1.1).fill({ color: FLAME[1], alpha: 0.75 }), { x, y, duration: 0.5, scale: 0.15 });
      mote(layer, { x, y }, (g) => g.circle(0, 0, r * 0.6).fill(FLAME[2]), { x, y, duration: 0.25, scale: 0.2 });
    });
    drop(rock);
    const wave = big ? 64 : 44;
    pulse(layer, to, (g) => g.circle(0, 0, wave * 0.6).fill({ color: FLAME[2], alpha: 0.9 }), 0.2, 1, 0.28);
    pulse(layer, to, (g) => g.circle(0, 0, wave).stroke({ width: 6, color: FLAME[1] }), 0.15, 1, 0.45);
    pulse(layer, to, (g) => g.circle(0, 0, wave * 1.3).stroke({ width: 3, color: 0xffffff, alpha: 0.7 }), 0.15, 1, 0.5, 0.06);
    scatter(layer, to, big ? 10 : 6, [35, big ? 85 : 60], (g) => drawRock(g, rand(2.5, 4), Math.random() * 100), {
      yEase: 'back.in(2.5)',
      rotation: rand(-6, 6),
      duration: 0.7,
    });
    for (let i = 0; i < (big ? 4 : 3); i++) {
      const at = { x: to.x + rand(-20, 20), y: to.y + rand(0, 12) };
      mote(layer, at, (g) => g.circle(0, 0, rand(7, 11)).fill({ color: 0x6a5a86, alpha: 0.5 }), {
        x: at.x + rand(-20, 20),
        y: at.y - rand(15, 30),
        duration: 0.9,
        scale: 2,
      });
    }
  },

  /** A comet changing colour as it flies, laying a rainbow ribbon and twinkles; it lands as a firework. */
  async rainbow(layer, shot) {
    const { to, big } = shot;
    const r = big ? 13 : 8.5;
    const start = Math.random() * 360;
    const comet = head(layer, () => {});
    let last = 0;
    let lastTwinkle = 0;
    await fly(layer, shot, { duration: big ? 0.55 : 0.42, arc: shot.side * rand(40, 80) }, (x, y, _heading, t) => {
      const h = start + t * 540;
      comet.clear();
      drawComet(comet, r, h);
      comet.position.set(x, y);
      comet.scale.set(1 + Math.sin(t * 30) * 0.12);
      if (t - last >= 0.018) {
        last = t;
        mote(layer, { x, y }, (g) => g.circle(0, 0, r * 1.1).fill({ color: hue(h), alpha: 0.85 }), { x, y, duration: 0.55, scale: 0.15 });
      }
      if (t - lastTwinkle >= 0.09) {
        lastTwinkle = t;
        const at = { x: x + rand(-14, 14), y: y + rand(-14, 14) };
        pulse(layer, at, (g) => drawSparkle(g, rand(4, 7)), 1.2, 0.1, 0.4);
      }
    });
    drop(comet);
    pulse(layer, to, (g) => g.circle(0, 0, big ? 30 : 20).fill({ color: 0xffffff, alpha: 0.95 }), 0.3, 1.2, 0.25);
    [0, 1, 2].forEach((i) => {
      const ring = (big ? 34 : 24) + i * (big ? 16 : 11);
      pulse(layer, to, (g) => g.circle(0, 0, ring).stroke({ width: 4, color: hue(start + i * 120) }), 0.2, 1, 0.45, i * 0.06);
    });
    const count = big ? 22 : 13;
    scatter(layer, to, count, [40, big ? 95 : 70], (g, i) => g.circle(0, 0, rand(2.5, 4)).fill(hue(start + (i / count) * 360)), {
      yEase: 'back.in(1.8)',
      duration: 0.85,
    });
    for (let i = 0; i < (big ? 7 : 4); i++) {
      const at = { x: to.x + rand(-50, 50), y: to.y + rand(-45, 35) };
      pulse(layer, at, (g) => drawSparkle(g, rand(5, 9), hue(start + i * 70, 0.35)), 0.1, 1.1, 0.5, 0.1 + i * 0.05);
    }
  },
};

/**
 * A still picture of an effect for the shop's swatch, `size` px square: the head flying up to the
 * right with its trail behind it. `color` is the digit colour the default orb takes.
 */
export function drawEffectIcon(effect: string, size: number, color: number): Container {
  const icon = new Container();
  const g = new Graphics();
  icon.addChild(g);
  const s = size / 100;
  const at = (x: number, y: number) => ({ x: x * s, y: y * s });
  const place = (piece: Graphics, x: number, y: number, rotation = 0) => {
    piece.position.set(x * s, y * s);
    piece.rotation = rotation;
    icon.addChild(piece);
    return piece;
  };
  // The trail runs from the bottom left to the head at the top right.
  const trail = (count: number, draw: (g: Graphics, k: number) => Graphics) => {
    for (let i = 0; i < count; i++) {
      const k = (i + 1) / (count + 1);
      place(draw(new Graphics(), k), 18 + k * 44, 80 - k * 42);
    }
  };
  const heading = -Math.PI / 4;
  switch (effect) {
    case 'stars':
      trail(3, (piece, k) => drawStarShape(piece, s * (4 + k * 5)));
      place(drawStarShape(new Graphics(), s * 17), 68, 34, 0.3);
      break;
    case 'frost':
      trail(5, (piece, k) => piece.star(0, 0, 4, s * (2.5 + k * 3), s * 1.2).fill(ICE));
      place(drawShard(new Graphics(), s * 30, s * 11), 66, 36, heading);
      break;
    case 'fire':
      trail(6, (piece, k) => piece.circle(0, 0, s * (4 + k * 8)).fill(FLAME[Math.round(k * 2)]));
      place(drawFireball(new Graphics(), s * 13), 68, 34);
      break;
    case 'lightning': {
      let n = 3;
      const rng = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
      drawBolt(g, jagged(at(14, 86), at(84, 16), 6, 14 * s, rng), 4.5 * s);
      g.circle(84 * s, 16 * s, 10 * s).fill({ color: 0xffffff, alpha: 0.9 });
      break;
    }
    case 'meteor':
      for (let i = 0; i < 8; i++) {
        const k = (i + 1) / 9;
        place(new Graphics().circle(0, 0, s * (4 + k * 11)).fill({ color: FLAME[1], alpha: 0.4 + k * 0.4 }), 14 + k * 50, 86 - k * 48);
      }
      place(drawRock(new Graphics(), s * 15, 7), 68, 34, 0.4);
      break;
    case 'rainbow':
      for (let i = 0; i < 10; i++) {
        const k = (i + 1) / 11;
        place(new Graphics().circle(0, 0, s * (4 + k * 8)).fill(hue(i * 36)), 14 + k * 50, 86 - k * 48);
      }
      place(drawComet(new Graphics(), s * 12, 300), 68, 34);
      place(drawSparkle(new Graphics(), s * 9), 30, 40);
      place(drawSparkle(new Graphics(), s * 6), 82, 66);
      break;
    default:
      trail(4, (piece, k) => piece.circle(0, 0, s * (2 + k * 3)).fill(color));
      place(
        new Graphics()
          .circle(0, 0, s * 20)
          .fill({ color, alpha: 0.25 })
          .circle(0, 0, s * 11)
          .fill(color)
          .circle(0, 0, s * 5)
          .fill(0xffffff),
        66,
        36,
      );
  }
  return icon;
}
