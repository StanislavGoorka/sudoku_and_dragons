import { Container, Graphics, Text, type PointData } from 'pixi.js';
import { DESIGNS } from '../art/dragonArt.ts';
import { theme } from '../theme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { HpBar } from './HpBar.ts';
import { Scene, SCENES } from './Scene.ts';

/**
 * The fight above the board in a duel: two dragons facing each other over a twilight scene, the
 * rival's HP across the sky, yours along the ground, and whose turn it is between the dragons.
 */
export class DuelArena extends Container {
  readonly timer = new ChargeMeter('');
  /** Each dragon in the colour of its player's digits: yours blue, the rival's orange. */
  private readonly myDragon = new DragonView(DESIGNS['duel-mine']);
  private readonly rivalDragon = new DragonView(DESIGNS['duel-rival']);
  private readonly myHp: HpBar;
  private readonly rivalHp: HpBar;
  private readonly scene = new Scene(SCENES.duel);
  /** A gold pill on your turn, a dark one on the rival's. */
  private readonly turnPill = new Graphics();
  private readonly turnText = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 15, fill: theme.text, align: 'center', lineHeight: 17 },
  });
  private mine = false;

  constructor(myName: string, rivalName: string, maxHp: number) {
    super();
    this.myHp = new HpBar(`Ty · ${myName}`, maxHp, theme.playerHp);
    this.rivalHp = new HpBar(rivalName, maxHp, theme.enemyHp);
    this.turnText.anchor.set(0.5, 0.5);
    // Dragons face left: mirror yours so the two face each other.
    this.myDragon.scale.x = -1;
    this.addChild(this.scene, this.myDragon, this.rivalDragon, this.turnPill, this.turnText, this.timer, this.rivalHp, this.myHp);
  }

  /** `corner` keeps the top-left corner free (for the screen's pause or leave button). */
  layout(width: number, height: number, corner = 0): void {
    const pad = 10;
    this.scene.layout(width, height);
    this.rivalHp.position.set(pad + corner, pad);
    this.rivalHp.layout(width - pad * 2 - corner);
    this.myHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.myHp.layout(width - pad * 2);

    const top = pad + HpBar.HEIGHT + 4;
    const ground = this.scene.groundY() + 4;
    // As big as fits beside the turn pill in the middle.
    const dragonSize = Math.max(32, Math.min(width * 0.32, (ground - top) * 1.05));
    for (const [dragon, x] of [
      [this.myDragon, width * 0.18],
      [this.rivalDragon, width * 0.82],
    ] as const) {
      dragon.layout(dragonSize);
      dragon.position.set(x, ground - dragon.footOffset());
    }

    const radius = Math.max(12, Math.min(22, (ground - top) * 0.15));
    this.turnText.position.set(width / 2, top + 26);
    this.timer.position.set(width / 2, this.turnText.y + 26 + radius + 10);
    this.timer.layout(radius);
    this.drawPill();
  }

  setRivalName(name: string): void {
    this.rivalHp.setName(name);
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

  dragon(mine: boolean): DragonView {
    return mine ? this.myDragon : this.rivalDragon;
  }

  /** Where hits on a player's dragon land, in arena coordinates. */
  dragonPoint(mine: boolean): PointData {
    const dragon = this.dragon(mine);
    return { x: dragon.x, y: dragon.y };
  }

  private drawPill(): void {
    const w = Math.max(this.turnText.width + 26, 96);
    const h = this.turnText.height + 10;
    const { x, y } = this.turnText.position;
    this.turnPill
      .clear()
      .roundRect(x - w / 2, y - h / 2, w, h, h / 2)
      .fill(this.mine ? { color: theme.gold } : { color: theme.hpTrack, alpha: 0.7 });
  }
}
