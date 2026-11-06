import gsap from 'gsap';
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { DragonDesign } from '../art/dragonArt.ts';

const INK = 0x20263a;
const GOLD = 0xf1cb79;
const outline = { color: INK, width: 2.6, join: 'round' } as const;
const plate = (g: Graphics, points: number[], color: number) => g.poly(points).fill(color).stroke(outline);

/** Armored human, drawn in the game's vector style. Faces right; the rig can be mirrored. */
export class WarriorView extends Container {
  private readonly art = new Container();
  private readonly rig = new Container();
  private readonly torso = new Container();
  private readonly sword = new Container();
  private readonly shield = new Container();
  private readonly cape = new Graphics();
  private readonly slash = new Graphics();
  private readonly shadow = new Graphics().ellipse(0, 49, 32, 5).fill({ color: INK, alpha: .28 });
  private idle?: gsap.core.Timeline;
  private action?: gsap.core.Timeline;
  private defeat?: Promise<void>;
  private dead = false;

  constructor(design: DragonDesign, { idle = true, facingLeft = false } = {}) {
    super();
    // Keep the existing cosmetic catalog and translate its colors to steel, cloth and leather.
    const { body, shade, light, membraneShade } = design.palette;
    const legs = new Graphics();
    plate(legs, [-17, 9, -2, 13, -12, 40, -18, 44, -27, 39], shade);
    plate(legs, [0, 10, 16, 8, 20, 33, 27, 43, 20, 47, 11, 41], body);
    plate(legs, [-26, 37, -16, 40, -17, 48, -32, 48, -33, 44], INK);
    plate(legs, [17, 38, 25, 38, 33, 44, 32, 48, 18, 48], INK);
    plate(legs, [6, 22, 16, 20, 19, 29, 14, 34, 9, 28], light);

    plate(this.cape, [-16, -24, -5, -11, -18, 17, -36, 32, -41, 26, -28, 6], membraneShade);
    this.cape.moveTo(-15, -17).lineTo(-28, 21).stroke({ width: 2.4, color: body, alpha: .7 });
    this.cape.pivot.set(-16, -24);
    this.cape.position.set(-16, -24);

    const cuirass = new Graphics();
    plate(cuirass, [-19, -24, -4, -28, 14, -22, 20, -10, 12, 16, -14, 16, -21, -5], body);
    plate(cuirass, [-15, -18, 2, -23, 12, -17, 8, -4, -5, 2, -15, -4], light);
    plate(cuirass, [-14, 8, 13, 8, 12, 15, -14, 15], 0x524253);
    cuirass.roundRect(-4, 8, 9, 8, 2).fill(GOLD).stroke({ color: INK, width: 1.3 });
    plate(cuirass, [-22, -24, -11, -26, -8, -18, -16, -12, -25, -15], shade);

    const head = new Graphics();
    // Visible cheek, nose and eye make the silhouette read as a person at phone size.
    plate(head, [-9, -47, 9, -48, 17, -41, 18, -35, 22, -31, 17, -29, 15, -23, 4, -20, -8, -28], 0xe8ab79);
    plate(head, [-14, -32, -15, -46, -7, -55, 8, -56, 19, -50, 23, -42, 12, -39, 5, -34, 2, -26, -7, -25], shade);
    head.moveTo(-10, -44).quadraticCurveTo(-4, -54, 11, -50).stroke({ color: light, width: 3, cap: 'round' });
    head.moveTo(5, -35).lineTo(19, -41).stroke({ color: GOLD, width: 2.5, cap: 'round' });
    head.circle(15, -34, 1.7).fill(INK).moveTo(12, -26).lineTo(16, -27).stroke({ color: 0x78483f, width: 1.4 });

    const arm = new Graphics();
    plate(arm, [-6, -5, 5, -8, 13, -2, 12, 8, 25, 12, 22, 21, 6, 18, -3, 8], shade);
    plate(arm, [11, 8, 24, 9, 26, 17, 19, 21, 10, 17], light);
    plate(arm, [22, 13, 30, 12, 34, 17, 29, 22, 23, 21], 0xe8ab79);
    // Sword points up and forward in guard; the entire arm rotates through the cut.
    plate(arm, [28, 15, 42, -24, 52, -33, 52, -20, 35, 18], 0xc7dfed);
    arm.moveTo(33, 13).lineTo(49, -25).stroke({ width: 2, color: 0xf6fcff });
    plate(arm, [21, 11, 41, 19, 39, 24, 20, 17], GOLD);
    this.sword.position.set(9, -19);
    this.sword.addChild(arm);

    const buckler = new Graphics();
    plate(buckler, [-14, -10, 0, -15, 14, -10, 13, 4, 6, 13, 0, 17, -8, 11, -14, 2], GOLD);
    plate(buckler, [-10, -7, 0, -11, 10, -7, 9, 3, 0, 12, -9, 4], shade);
    buckler.moveTo(0, -7).lineTo(0, 7).moveTo(-5, 0).lineTo(5, 0).stroke({ width: 2.5, color: light, cap: 'round' });
    this.shield.position.set(-12, -2);
    this.shield.addChild(buckler);

    this.slash.moveTo(3, -65).quadraticCurveTo(68, -57, 81, 2).quadraticCurveTo(54, -33, 3, -65)
      .fill({ color: 0xffe2a0, alpha: .76 });
    this.slash.alpha = 0;
    this.torso.addChild(this.cape, cuirass, head, this.sword, this.shield);
    this.rig.addChild(legs, this.torso, this.slash);
    this.art.addChild(this.shadow, this.rig);
    this.addChild(this.art);
    this.scale.x = facingLeft ? -1 : 1;
    if (idle) {
      this.idle = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: .85, ease: 'sine.inOut' } });
      this.idle.to(this.torso, { y: 1.7, rotation: .025 }, 0).to(this.cape, { rotation: -.09 }, 0);
    }
  }

  layout(size: number): void { this.art.scale.set(size / 108); }
  footOffset(): number { return 49 * this.art.scale.y; }

  attack(): void {
    if (this.dead) return;
    const t = this.pose();
    t.to(this.sword, { rotation: -.93, duration: .105 }, 0)
      .to(this.rig, { x: -5, rotation: -.09, duration: .105 }, 0)
      .to(this.sword, { rotation: .92, duration: .13, ease: 'power2.in' }, .105)
      .to(this.rig, { x: 17, rotation: .12, duration: .13 }, .105)
      .to(this.slash, { alpha: 1, duration: .06 }, .17)
      .to(this.slash, { alpha: 0, duration: .18 }, .24)
      .to(this.rig, { x: 0, rotation: 0, duration: .27 }, .235)
      .to(this.sword, { rotation: 0, duration: .27 }, .235);
  }

  hurt(strength: number): void {
    if (this.dead) return;
    const t = this.pose();
    this.rig.tint = 0xff9a88;
    t.to(this.rig, { x: -Math.min(strength, 20), rotation: -.19, duration: .09 }, 0)
      .to(this.shield, { x: 3, rotation: -.32, duration: .1 }, 0)
      .set(this.rig, { tint: 0xffffff }, .12)
      .to(this.rig, { x: 0, rotation: 0, duration: .34 }, .11)
      .to(this.shield, { x: -12, rotation: 0, duration: .34 }, .11);
  }

  celebrate(): void {
    if (this.dead) return;
    this.pose().to(this.sword, { rotation: -.71, duration: .25 }, 0)
      .to(this.rig, { y: -5, duration: .2, yoyo: true, repeat: 1 }, 0)
      .to(this.sword, { rotation: 0, duration: .35 }, .7);
  }

  cast(): void {
    if (this.dead) return;
    this.pose().to(this.shield, { x: 4, rotation: -.3, duration: .16, yoyo: true, repeat: 1 }, 0)
      .to(this.sword, { rotation: -.38, duration: .16, yoyo: true, repeat: 1 }, 0);
  }

  die(): Promise<void> {
    if (this.defeat) return this.defeat;
    this.dead = true;
    this.idle?.kill();
    const t = this.pose();
    this.defeat = new Promise(resolve => {
      t.eventCallback('onComplete', resolve).eventCallback('onInterrupt', resolve)
        .to(this.sword, { rotation: .95, duration: .3 }, 0)
        .to(this.shield, { rotation: .65, duration: .3 }, 0)
        .to(this.rig, { x: -17, y: 37, rotation: -1.22, duration: .58, ease: 'power2.in' }, 0)
        .set(this.rig, { tint: 0x9c9aa9 }, .48);
    });
    return this.defeat;
  }

  override destroy(options?: DestroyOptions): void {
    this.idle?.kill();
    this.action?.kill();
    super.destroy(options);
  }

  private pose(): gsap.core.Timeline {
    this.action?.kill();
    this.rig.position.set(0);
    this.rig.rotation = 0;
    this.rig.tint = 0xffffff;
    this.sword.rotation = 0;
    this.shield.x = -12;
    this.shield.rotation = 0;
    this.slash.alpha = 0;
    return this.action = gsap.timeline({ defaults: { ease: 'power2.out' } });
  }
}
