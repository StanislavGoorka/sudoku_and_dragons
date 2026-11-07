import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions, type PointData } from 'pixi.js';
import type { DragonDesign } from '../art/dragonArt.ts';
import { rivalDesign } from '../dragonSkins.ts';
import { killTweens } from '../fx/tweens.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { WarriorView } from './WarriorView.ts';
import { HpBar } from './HpBar.ts';
import { Scene, SCENES } from './Scene.ts';

/**
 * The fight above the board in a duel: two fighters facing each other over a twilight scene, the
 * rival's HP across the sky, yours along the ground, and whose turn it is between the fighters.
 * Human players wear their chosen armor. The training bot is a dragon.
 */
export class DuelArena extends Container {
  readonly timer = new ChargeMeter('');
  private readonly myWarrior: WarriorView;
  /** Hidden until `showRival`. */
  private rivalFighter: DragonView | WarriorView;
  private rivalDesign: DragonDesign | null = null;
  private fighterSize = 0;
  /** Where the rival goes (x, ground), once laid out. */
  private rivalSpot: [number, number] | null = null;
  private readonly myHp: HpBar;
  private readonly rivalHp: HpBar;
  private readonly scene = new Scene(SCENES.duel);
  /** A gold pill on your turn, a dark one on the rival's. */
  private readonly turnPill = new Graphics();
  private readonly turnText = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '600', fontSize: 13, fill: theme.text, align: 'center', lineHeight: 17 },
  });
  private mine = false;

  constructor(myName: string, rivalName: string, maxHp: number, myDesign: DragonDesign, private readonly bot: boolean, rivalMaxHp = maxHp) {
    super();
    this.myWarrior = new WarriorView(myDesign);
    this.rivalFighter = this.makeRival(rivalDesign(null));
    this.rivalFighter.visible = false;
    this.myHp = new HpBar(`Ty · ${myName}`, maxHp, theme.playerHp);
    this.rivalHp = new HpBar(rivalName, rivalMaxHp, theme.enemyHp);
    this.turnText.anchor.set(0.5, 0.5);
    this.addChild(this.scene, this.myWarrior, this.rivalFighter, this.turnPill, this.turnText, this.timer, this.rivalHp, this.myHp);
  }

  /**
   * `corner` keeps the top-left corner free (for the screen's pause or leave button), `cornerRight` the
   * top-right one (the notes toggle).
   */
  layout(width: number, height: number, corner = 0, cornerRight = 0, skillWidth = 0): void {
    const pad = 10;
    this.scene.layout(width, height);
    this.rivalHp.position.set(pad + corner, pad);
    this.rivalHp.layout(width - pad * 2 - corner - cornerRight);
    this.myHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.myHp.layout(width - pad * 2 - (skillWidth ? skillWidth + 8 : 0));

    const top = pad + HpBar.HEIGHT + 4;
    const ground = this.scene.groundY() + 4;
    // As big as fits beside the turn pill in the middle.
    this.fighterSize = Math.max(32, Math.min(width * 0.32, (ground - top) * 1.05));
    this.placeFighter(this.myWarrior, width * 0.18, ground);
    this.rivalSpot = [width * 0.82, ground];
    this.placeFighter(this.rivalFighter, ...this.rivalSpot);

    const radius = Math.max(12, Math.min(22, (ground - top) * 0.15));
    this.turnText.position.set(width / 2, top + 26);
    this.timer.position.set(width / 2, this.turnText.y + 26 + radius + 10);
    this.timer.layout(radius);
    this.drawPill();
  }

  setRivalName(name: string): void {
    this.rivalHp.setName(name);
  }

  get rivalShown(): boolean {
    return this.rivalDesign !== null;
  }

  /** Shows the rival with their current colors. */
  showRival(design: DragonDesign): void {
    if (design === this.rivalDesign) return;
    this.rivalDesign = design;
    const old = this.rivalFighter;
    const view = this.makeRival(design);
    this.addChildAt(view, this.getChildIndex(old));
    killTweens(old.scale, old);
    old.destroy({ children: true });
    this.rivalFighter = view;
    if (this.rivalSpot) this.placeFighter(view, ...this.rivalSpot);
    gsap.fromTo(view, { alpha: 0 }, { alpha: 1, duration: 0.25 });
    const facing = view.scale.x;
    gsap.fromTo(view.scale, { x: facing * 0.6, y: 0.6 }, { x: facing, y: 1, duration: 0.45, ease: 'back.out(2.5)' });
  }

  /** Whose turn it is and, on yours, how many digits are left (dots). */
  showTurn(mine: boolean, movesLeft: number, finished: boolean): void {
    this.mine = mine && !finished;
    if (finished) {
      this.turnText.text = 'Koniec';
    } else if (mine) {
      this.turnText.text = `Twoja tura\n${'●'.repeat(movesLeft)}`;
    } else {
      this.turnText.text = 'Tura rywala';
    }
    this.turnText.style.fill = this.mine ? theme.buttonPrimaryText : theme.text;
    this.timer.visible = !finished;
    this.drawPill();
  }

  hpBar(mine: boolean): HpBar {
    return mine ? this.myHp : this.rivalHp;
  }

  fighter(mine: boolean): DragonView | WarriorView {
    return mine ? this.myWarrior : this.rivalFighter;
  }

  /** Where hits on a fighter land, in arena coordinates. */
  fighterPoint(mine: boolean): PointData {
    const fighter = this.fighter(mine);
    return { x: fighter.x, y: fighter.y };
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.rivalFighter, this.rivalFighter.scale);
    super.destroy(options);
  }

  private makeRival(design: DragonDesign): DragonView | WarriorView {
    return this.bot ? new DragonView(design) : new WarriorView(design, { facingLeft: true });
  }

  private placeFighter(fighter: DragonView | WarriorView, x: number, ground: number): void {
    fighter.layout(this.fighterSize);
    fighter.position.set(x, ground - fighter.footOffset());
  }

  private drawPill(): void {
    const w = Math.max(this.turnText.width + 26, 96);
    const h = this.turnText.height + 10;
    const { x, y } = this.turnText.position;
    this.turnPill
      .clear()
      .roundRect(x - w / 2, y - h / 2, w, h, 6)
      .fill(this.mine ? { color: theme.buttonPrimary } : { color: theme.panel, alpha: 0.96 });
  }
}
