import { Container, type PointData } from 'pixi.js';
import type { EnemyDef } from '../../core/index.ts';
import { designOf } from '../enemies.ts';
import { theme } from '../theme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { HpBar } from './HpBar.ts';
import { Scene, SCENES } from './Scene.ts';

/**
 * The fight above the board: the dragon hovering over its own scene, its HP across the sky,
 * its attack countdown beside it, and the player's HP along the ground.
 */
export class BattleArena extends Container {
  readonly dragon: DragonView;
  readonly charge = new ChargeMeter();
  readonly enemyHp: HpBar;
  readonly playerHp: HpBar;
  private readonly scene: Scene;

  constructor(enemy: EnemyDef, playerMaxHp: number) {
    super();
    this.scene = new Scene(SCENES[enemy.id] ?? SCENES.dragon);
    this.dragon = new DragonView(designOf(enemy));
    this.enemyHp = new HpBar(enemy.name, enemy.maxHp, theme.enemyHp);
    this.playerHp = new HpBar('Ty', playerMaxHp, theme.playerHp);
    this.addChild(this.scene, this.dragon, this.charge, this.enemyHp, this.playerHp);
  }

  /** `corner` keeps the top-left corner free (for the screen's pause or leave button). */
  layout(width: number, height: number, corner = 0): void {
    const pad = 10;
    this.scene.layout(width, height);
    this.enemyHp.position.set(pad + corner, pad);
    this.enemyHp.layout(width - pad * 2 - corner);
    this.playerHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.playerHp.layout(width - pad * 2);

    // The dragon fills the sky between its HP bar and the ground, and casts its shadow on the ground.
    const top = pad + HpBar.HEIGHT + 4;
    const ground = this.scene.groundY() + 4;
    this.dragon.layout(Math.max(32, Math.min(width * 0.62, (ground - top) * 1.05)));
    this.dragon.position.set(width / 2 + width * 0.04, ground - this.dragon.footOffset());

    const radius = Math.max(14, Math.min(24, (ground - top) * 0.16));
    this.charge.position.set(pad + radius + 8, top + radius + 10);
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

  /** The attack countdown, in arena coordinates (knockback numbers float up from it). */
  chargePoint(): PointData {
    return { x: this.charge.x, y: this.charge.y };
  }
}
