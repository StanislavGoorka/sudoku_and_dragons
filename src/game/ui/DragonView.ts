import gsap from 'gsap';
import { Container, Graphics, GraphicsContext, GraphicsPath, type DestroyOptions, type PointData } from 'pixi.js';
import { dragonParts, OUTLINE, PIVOTS, VIEW, type DragonDesign, type Part, type PartName } from '../art/dragonArt.ts';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';

/** Graphics are built once per design and part, then shared by every view of that design. */
const contexts = new WeakMap<DragonDesign, Map<PartName, GraphicsContext>>();

function contextsOf(design: DragonDesign): Map<PartName, GraphicsContext> {
  let byPart = contexts.get(design);
  if (byPart) return byPart;
  byPart = new Map();
  for (const part of dragonParts(design)) byPart.set(part.name, buildContext(part, design.palette.outline));
  contexts.set(design, byPart);
  return byPart;
}

/** One outline around the part's silhouette first, then its fills and lines on top. */
function buildContext(part: Part, outline: number): GraphicsContext {
  const context = new GraphicsContext();
  for (const shape of part.shapes) {
    if (!shape.outlined) continue;
    context
      .path(new GraphicsPath(shape.d))
      .fill(outline)
      .stroke({ width: OUTLINE * 2, color: outline, join: 'round' });
  }
  for (const shape of part.shapes) {
    if (shape.fill !== undefined) context.path(new GraphicsPath(shape.d)).fill({ color: shape.fill, alpha: shape.alpha ?? 1 });
    if (shape.stroke) {
      context.path(new GraphicsPath(shape.d)).stroke({ ...shape.stroke, cap: 'round', join: 'round' });
    }
  }
  return context;
}

/**
 * A dragon from dragonArt, facing left, with its parts animated: it hovers with its wings beating,
 * sways its tail, bobs its head and blinks. `rig` takes the action poses (hurt, attack, death) in
 * pixels; the idle motion runs on the parts inside it, so the two never fight over a property.
 */
export class DragonView extends Container {
  private readonly rig = new Container();
  /** The art in canvas units, scaled to the box; the shadow stays on the ground outside the rig. */
  private readonly art = new Container();
  private readonly ground = new Container();
  private readonly hover = new Container();
  private readonly parts = new Map<PartName, Container>();
  /** The head sways idly here; `parts.get('head')` inside it takes the action poses. */
  private readonly headIdle = new Container();
  /** Fire glowing in the mouth as the dragon gets ready to attack. */
  private readonly glow = new Graphics();
  private readonly design: DragonDesign;
  private size = 100;
  /** 0–1: how close the timed attack is; the dragon reddens and its jaw opens. */
  private heat = 0;
  private flashing = false;
  private dead = false;
  private blinkCall: gsap.core.Tween | null = null;

  constructor(design: DragonDesign) {
    super();
    this.design = design;
    const byPart = contextsOf(design);
    for (const part of dragonParts(design)) {
      const view = new Container();
      view.addChild(new Graphics(byPart.get(part.name)!));
      view.pivot.set(...part.pivot);
      view.position.set(...part.pivot);
      view.scale.set(part.scale ?? 1);
      this.parts.set(part.name, view);
      let parent = part.parent ? this.parts.get(part.parent)! : part.name === 'shadow' ? this.ground : this.hover;
      if (part.name === 'head') {
        // Every part turns about a point in canvas units, so nesting needs the same pivot again.
        this.headIdle.pivot.set(...part.pivot);
        this.headIdle.position.set(...part.pivot);
        parent.addChild(this.headIdle);
        parent = this.headIdle;
      }
      parent.addChild(view);
    }
    // Fire filling the mouth, behind both jaws: it shows only as they part.
    this.glow
      .ellipse(98, 138, 44, 14)
      .fill(theme.fire)
      .ellipse(90, 138, 30, 9)
      .fill(theme.flash)
      .ellipse(84, 138, 16, 5)
      .fill(0xfff6c0);
    this.glow.alpha = 0;
    const head = this.part('head');
    head.addChildAt(this.glow, head.getChildIndex(this.part('jaw')));

    this.art.addChild(this.hover);
    this.rig.addChild(this.art);
    this.addChild(this.ground, this.rig);
    this.art.tint = this.restingTint();
    this.startIdle();
  }

  /** `size` is the height of the box the dragon should fill. */
  layout(size: number): void {
    this.size = size;
    const scale = (size / VIEW.height) * this.design.size;
    const centerX = VIEW.x + VIEW.width / 2;
    const centerY = VIEW.y + VIEW.height / 2;
    for (const layer of [this.art, this.ground]) {
      layer.scale.set(scale);
      layer.position.set(-centerX * scale, -centerY * scale);
    }
  }

  /** Where fire leaves the mouth, in global coordinates. */
  mouthGlobal(): PointData {
    return this.part('jaw').toGlobal({ x: PIVOTS.mouth[0], y: PIVOTS.mouth[1] });
  }

  hurt(strength: number): void {
    if (this.dead) return;
    killTweens(this.rig, this.rig.scale);
    this.rig.scale.set(1);
    gsap.fromTo(
      this.rig,
      { x: strength, y: 0, rotation: 0.002 * strength },
      { x: 0, rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' },
    );
    // The head snaps back and the eye squints.
    gsap.fromTo(this.part('head'), { rotation: 0.18 }, { rotation: 0, duration: 0.45, ease: 'power2.out' });
    gsap.fromTo(this.part('eye').scale, { y: 0.3 }, { y: 1, duration: 0.3, delay: 0.1, overwrite: 'auto' });
    this.art.tint = 0xff6b6b;
    this.flashing = true;
    gsap.delayedCall(0.12, () => {
      this.flashing = false;
      if (!this.destroyed && !this.dead) this.art.tint = this.restingTint();
    });
  }

  setHeat(heat: number): void {
    if (heat === this.heat || this.dead) return;
    this.heat = heat;
    if (!this.flashing) this.art.tint = this.restingTint();
    this.glow.alpha = heat;
    if (!gsap.isTweening(this.part('jaw'))) this.part('jaw').rotation = -0.3 * heat;
  }

  /** Rears back and lunges with its jaws open. Resolves at the peak of the lunge, when the fireball should leave. */
  attack(): Promise<void> {
    killTweens(this.rig, this.rig.scale);
    const head = this.part('head');
    const jaw = this.part('jaw');
    return new Promise((resolve) => {
      gsap
        .timeline()
        // Rear back: snout up, jaws shut.
        .to(head, { rotation: 0.25, duration: 0.14, ease: 'power2.out' }, 0)
        .to(jaw, { rotation: 0, duration: 0.14 }, 0)
        .to(this.rig, { x: 0, y: -this.size * 0.04, rotation: 0, duration: 0.14, ease: 'power2.out' }, 0)
        // Lunge: snout down, jaws wide, fire.
        .to(head, { rotation: -0.18, duration: 0.16, ease: 'power3.in' })
        .to(jaw, { rotation: -0.6, duration: 0.16, ease: 'power3.in' }, '<')
        .to(this.glow, { alpha: 1, duration: 0.16 }, '<')
        .to(this.rig, { y: this.size * 0.12, duration: 0.16, ease: 'power2.in' }, '<')
        .to(this.rig.scale, { x: 1.15, y: 1.15, duration: 0.16, ease: 'power2.in' }, '<')
        .call(resolve)
        .to(this.rig, { y: 0, duration: 0.35, ease: 'power2.out' })
        .to(this.rig.scale, { x: 1, y: 1, duration: 0.35, ease: 'power2.out' }, '<')
        .to(head, { rotation: 0, duration: 0.4, ease: 'power2.out' }, '<')
        .to(jaw, { rotation: 0, duration: 0.3 }, '<')
        .to(this.glow, { alpha: 0, duration: 0.3 }, '<');
    });
  }

  die(): Promise<void> {
    this.stopIdle();
    killTweens(this.rig, this.rig.scale);
    this.dead = true;
    this.art.tint = 0x8a8a8a;
    this.glow.alpha = 0;
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        // Wings fold, the head droops, the eye shuts, and the dragon drops out of the sky.
        .to(this.part('wingFront'), { rotation: 0.7, duration: 0.5, ease: 'power2.out' }, 0)
        .to(this.part('wingBack'), { rotation: 0.6, duration: 0.5, ease: 'power2.out' }, 0)
        .to(this.part('head'), { rotation: -0.45, duration: 0.5, ease: 'power2.out' }, 0)
        .to(this.part('jaw'), { rotation: -0.2, duration: 0.5 }, 0)
        .to(this.part('eye').scale, { y: 0.1, duration: 0.15 }, 0)
        .to(this.part('shadow'), { alpha: 0, duration: 0.9 }, 0)
        .to(this.rig, { x: 0, rotation: -0.5, y: this.size * 0.25, alpha: 0, duration: 0.9, ease: 'power2.in' }, 0)
        .to(this.rig.scale, { x: 0.6, y: 0.6, duration: 0.9, ease: 'power2.in' }, 0);
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.stopIdle();
    killTweens(this.rig, this.rig.scale, this.glow);
    super.destroy(options);
  }

  private part(name: PartName): Container {
    return this.parts.get(name)!;
  }

  /**
   * Hovering: the body rises on each downbeat of the wings and the shadow shrinks as it does;
   * the tail and head sway on their own slower rhythms, and the eye blinks now and then.
   */
  private startIdle(): void {
    const beat = 0.55;
    const loop = { yoyo: true, repeat: -1, ease: 'sine.inOut' } as const;
    gsap.fromTo(this.hover, { y: 4 }, { y: -8, duration: beat, ...loop });
    gsap.fromTo(this.part('shadow').scale, { x: 1, y: 1 }, { x: 0.86, y: 0.86, duration: beat, ...loop });
    gsap.fromTo(this.part('wingFront'), { rotation: -0.16 }, { rotation: 0.22, duration: beat, ...loop });
    gsap.fromTo(this.part('wingBack'), { rotation: -0.1 }, { rotation: 0.16, duration: beat, delay: 0.06, ...loop });
    gsap.fromTo(this.part('tail'), { rotation: -0.06 }, { rotation: 0.08, duration: 1.5, ...loop });
    gsap.fromTo(this.headIdle, { rotation: 0.03 }, { rotation: -0.04, duration: 1.3, ...loop });
    this.scheduleBlink();
  }

  private scheduleBlink(): void {
    this.blinkCall = gsap.delayedCall(2.5 + Math.random() * 3, () => {
      if (this.destroyed || this.dead) return;
      gsap.fromTo(this.part('eye').scale, { y: 1 }, { y: 0.1, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.in' });
      this.scheduleBlink();
    });
  }

  private stopIdle(): void {
    this.blinkCall?.kill();
    this.blinkCall = null;
    killTweens(this.hover, this.headIdle, ...this.parts.values(), ...[...this.parts.values()].map((p) => p.scale));
  }

  /** White, warming towards orange as the attack nears. */
  private restingTint(): number {
    const green = Math.round(255 - 115 * this.heat);
    const blue = Math.round(255 - 165 * this.heat);
    return (0xff << 16) | (green << 8) | blue;
  }
}
