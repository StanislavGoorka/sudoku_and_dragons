import { Container, Graphics, type PointData } from 'pixi.js';
import type { EnemyDef } from '../../core/index.ts';
import { designOf } from '../enemies.ts';
import { theme } from '../theme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { HpBar } from './HpBar.ts';

/**
 * The panel above the board: enemy HP on top, the dragon with its attack countdown,
 * player HP at the bottom.
 */
export class BattleArena extends Container {
  readonly dragon: DragonView;
  readonly charge = new ChargeMeter();
  readonly enemyHp: HpBar;
  readonly playerHp: HpBar;
  private readonly bg = new Graphics();

  constructor(enemy: EnemyDef, playerMaxHp: number) {
    super();
    this.dragon = new DragonView(designOf(enemy));
    this.enemyHp = new HpBar(enemy.name, enemy.maxHp, theme.enemyHp);
    this.playerHp = new HpBar('Ty', playerMaxHp, theme.playerHp);
    this.addChild(this.bg, this.dragon, this.charge, this.enemyHp, this.playerHp);
  }

  layout(width: number, height: number): void {
    const pad = 14;
    this.bg
      .clear()
      .roundRect(0, 0, width, height, 14)
      .fill(theme.arena)
      .stroke({ width: 1, color: theme.lineThin });

    this.enemyHp.position.set(pad, pad);
    this.enemyHp.layout(width - pad * 2);
    this.playerHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.playerHp.layout(width - pad * 2);

    const top = pad + HpBar.HEIGHT + 4;
    const bottom = height - pad - HpBar.HEIGHT - 4;
    const middle = (top + bottom) / 2;
    this.dragon.position.set(width / 2, middle);
    this.dragon.layout(Math.max(32, Math.min(width * 0.6, bottom - top)));

    // The caption under the ring needs ~16 px, so the dial sits a little above the middle.
    const radius = Math.max(12, Math.min(24, (bottom - top - 20) / 2));
    this.charge.position.set(pad + radius + 6, middle - 8);
    this.charge.layout(radius);
  }

  /** Where player attacks land, in arena coordinates. */
  enemyTarget(): PointData {
    return { x: this.dragon.x, y: this.dragon.y };
  }

  /** Where the dragon's fireball starts: its mouth, in arena coordinates. */
  fireOrigin(): PointData {
    return this.toLocal(this.dragon.mouthGlobal());
  }

  /** Where dragon attacks land, in arena coordinates. */
  playerTarget(): PointData {
    const center = this.playerHp.barCenter();
    return { x: this.playerHp.x + center.x, y: this.playerHp.y + center.y };
  }

  /** The attack countdown, in arena coordinates. */
  chargePoint(): PointData {
    return { x: this.charge.x, y: this.charge.y };
  }
}
