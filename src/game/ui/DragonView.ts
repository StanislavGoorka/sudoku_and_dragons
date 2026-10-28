import gsap from 'gsap';
import { Container, Text, type DestroyOptions } from 'pixi.js';

/**
 * Placeholder dragon drawn with an emoji until there is real art.
 * `rig` takes the action poses (hurt, attack, death); `body` inside it breathes idly,
 * so the two kinds of animation never fight over the same properties.
 */
export class DragonView extends Container {
  private readonly rig = new Container();
  private readonly body = new Text({ text: '🐉', style: { fontSize: 100 } });
  private size = 100;
  /** 0–1: how close the timed attack is; tints the dragon towards orange. */
  private heat = 0;
  private flashing = false;
  private dead = false;

  constructor() {
    super();
    this.body.anchor.set(0.5);
    this.rig.addChild(this.body);
    this.addChild(this.rig);
    gsap.to(this.body.scale, { x: 0.97, y: 1.04, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  /** `size` is the height of the box the dragon should fill. */
  layout(size: number): void {
    this.size = size;
    // An emoji glyph is roughly 1.2× its font size tall.
    this.body.style.fontSize = Math.round(size / 1.2);
  }

  hurt(strength: number): void {
    gsap.killTweensOf([this.rig, this.rig.scale]);
    this.rig.scale.set(1);
    gsap.fromTo(
      this.rig,
      { x: strength, y: 0, rotation: 0.002 * strength },
      { x: 0, rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' },
    );
    this.body.tint = 0xff6b6b;
    this.flashing = true;
    gsap.delayedCall(0.12, () => {
      this.flashing = false;
      if (!this.destroyed && !this.dead) this.body.tint = this.restingTint();
    });
  }

  setHeat(heat: number): void {
    if (heat === this.heat) return;
    this.heat = heat;
    if (!this.flashing && !this.dead) this.body.tint = this.restingTint();
  }

  private restingTint(): number {
    const green = Math.round(255 - 115 * this.heat);
    const blue = Math.round(255 - 165 * this.heat);
    return (0xff << 16) | (green << 8) | blue;
  }

  /** Lunges forward. Resolves at the peak of the lunge, when the fireball should leave. */
  attack(): Promise<void> {
    gsap.killTweensOf([this.rig, this.rig.scale]);
    return new Promise((resolve) => {
      gsap
        .timeline()
        .to(this.rig, { x: 0, y: this.size * 0.12, rotation: 0, duration: 0.18, ease: 'power2.in' }, 0)
        .to(this.rig.scale, { x: 1.15, y: 1.15, duration: 0.18, ease: 'power2.in' }, 0)
        .call(resolve)
        .to(this.rig, { y: 0, duration: 0.35, ease: 'power2.out' })
        .to(this.rig.scale, { x: 1, y: 1, duration: 0.35, ease: 'power2.out' }, '<');
    });
  }

  die(): Promise<void> {
    gsap.killTweensOf([this.rig, this.rig.scale, this.body.scale]);
    this.dead = true;
    this.body.tint = 0x8a8a8a;
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        .to(this.rig, { x: 0, rotation: -0.5, y: this.size * 0.25, alpha: 0, duration: 0.9, ease: 'power2.in' }, 0)
        .to(this.rig.scale, { x: 0.6, y: 0.6, duration: 0.9, ease: 'power2.in' }, 0);
    });
  }

  override destroy(options?: DestroyOptions): void {
    gsap.killTweensOf([this.rig, this.rig.scale, this.body.scale]);
    super.destroy(options);
  }
}
