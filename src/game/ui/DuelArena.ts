import { Container, Graphics, Text, type PointData } from 'pixi.js';
import { DESIGNS } from '../art/dragonArt.ts';
import { theme } from '../theme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { HpBar } from './HpBar.ts';

/**
 * The panel above the board in a duel: the rival's HP on top, the two dragons facing each other
 * with the turn countdown between them, your HP at the bottom.
 */
export class DuelArena extends Container {
  readonly timer = new ChargeMeter('s');
  /** Each dragon in the colour of its player's digits: yours blue, the rival's orange. */
  private readonly myDragon = new DragonView(DESIGNS['duel-mine']);
  private readonly rivalDragon = new DragonView(DESIGNS['duel-rival']);
  private readonly myHp: HpBar;
  private readonly rivalHp: HpBar;
  private readonly turnText = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 14, fill: theme.text, align: 'center' },
  });
  private readonly bg = new Graphics();

  constructor(myName: string, rivalName: string, maxHp: number) {
    super();
    this.myHp = new HpBar(`Ty · ${myName}`, maxHp, theme.playerHp);
    this.rivalHp = new HpBar(rivalName, maxHp, theme.enemyHp);
    this.turnText.anchor.set(0.5, 1);
    // Dragons face left: mirror yours so the two face each other.
    this.myDragon.scale.x = -1;
    this.addChild(this.bg, this.myDragon, this.rivalDragon, this.timer, this.turnText, this.rivalHp, this.myHp);
  }

  layout(width: number, height: number): void {
    const pad = 14;
    this.bg
      .clear()
      .roundRect(0, 0, width, height, 14)
      .fill(theme.arena)
      .stroke({ width: 1, color: theme.lineThin });

    this.rivalHp.position.set(pad, pad);
    this.rivalHp.layout(width - pad * 2);
    this.myHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.myHp.layout(width - pad * 2);

    const top = pad + HpBar.HEIGHT + 4;
    const bottom = height - pad - HpBar.HEIGHT - 4;
    const middle = (top + bottom) / 2;
    // As big as fits beside the turn text in the middle.
    const dragonSize = Math.max(32, Math.min(width * 0.32, bottom - top));
    this.myDragon.position.set(width * 0.17, middle);
    this.myDragon.layout(dragonSize);
    this.rivalDragon.position.set(width * 0.83, middle);
    this.rivalDragon.layout(dragonSize);

    const radius = Math.max(12, Math.min(22, (bottom - top - 40) / 2));
    this.timer.position.set(width / 2, middle + 6);
    this.timer.layout(radius);
    this.turnText.position.set(width / 2, middle + 6 - radius - 6);
  }

  setRivalName(name: string): void {
    this.rivalHp.setName(name);
  }

  /** Whose turn it is and, on yours, how many digits are left (dots). */
  showTurn(mine: boolean, movesLeft: number, finished: boolean): void {
    if (finished) {
      this.turnText.text = 'Koniec';
    } else if (mine) {
      this.turnText.text = `Twoja tura\n${'●'.repeat(movesLeft)}`;
    } else {
      this.turnText.text = 'Tura rywala';
    }
    this.turnText.style.fill = mine && !finished ? theme.flash : theme.textMuted;
    this.timer.visible = !finished;
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
}
