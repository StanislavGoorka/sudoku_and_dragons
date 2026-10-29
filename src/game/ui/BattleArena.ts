import { Container, type PointData } from 'pixi.js';
import type { EnemyDef } from '../../core/index.ts';
import type { DragonDesign } from '../art/dragonArt.ts';
import { designOf } from '../enemies.ts';
import { theme } from '../theme.ts';
import { ChargeMeter } from './ChargeMeter.ts';
import { DragonView } from './DragonView.ts';
import { HpBar } from './HpBar.ts';
import { Scene, SCENES } from './Scene.ts';

/** Your dragon next to the enemy: smaller, the enemy is the boss. */
const PLAYER_SCALE = 0.72;

/**
 * The fight above the board: the enemy dragon over its own scene on the right, its HP across the sky,
 * your dragon (in your skin) facing it from the left with your HP along the ground, and the countdown
 * to the enemy's attack between them.
 */
export class BattleArena extends Container {
  /** The enemy. */
  readonly dragon: DragonView;
  readonly playerDragon: DragonView;
  readonly charge = new ChargeMeter();
  readonly enemyHp: HpBar;
  readonly playerHp: HpBar;
  private readonly scene: Scene;

  constructor(enemy: EnemyDef, playerMaxHp: number, playerDesign: DragonDesign) {
    super();
    this.scene = new Scene(SCENES[enemy.id] ?? SCENES.dragon);
    this.dragon = new DragonView(designOf(enemy));
    this.playerDragon = new DragonView(playerDesign);
    // Dragons face left: mirror yours so the two face each other.
    this.playerDragon.scale.x = -1;
    this.enemyHp = new HpBar(enemy.name, enemy.maxHp, theme.enemyHp);
    this.playerHp = new HpBar('Ty', playerMaxHp, theme.playerHp);
    this.addChild(this.scene, this.playerDragon, this.dragon, this.charge, this.enemyHp, this.playerHp);
  }

  /** `corner` keeps the top-left corner free (for the screen's pause or leave button). */
  layout(width: number, height: number, corner = 0): void {
    const pad = 10;
    this.scene.layout(width, height);
    this.enemyHp.position.set(pad + corner, pad);
    this.enemyHp.layout(width - pad * 2 - corner);
    this.playerHp.position.set(pad, height - pad - HpBar.HEIGHT);
    this.playerHp.layout(width - pad * 2);

    // Both dragons stand on the ground and cast their shadows on it; the enemy fills the sky as far as the width allows.
    const top = pad + HpBar.HEIGHT + 4;
    const ground = this.scene.groundY() + 4;
    const enemySize = Math.max(32, Math.min(width * 0.5, (ground - top) * 1.05));
    this.dragon.layout(enemySize);
    this.dragon.position.set(width * 0.68, ground - this.dragon.footOffset());
    const playerSize = enemySize * PLAYER_SCALE;
    this.playerDragon.layout(playerSize);
    // Far enough in that the tail stays inside the scene.
    this.playerDragon.position.set(Math.max(width * 0.18, playerSize * 0.5 + 4), ground - this.playerDragon.footOffset());

    // The countdown sits low between the two, where their bodies leave the most room, just above your HP.
    const radius = Math.max(14, Math.min(24, (ground - top) * 0.16));
    const captionHeight = 18;
    this.charge.position.set(
      (this.playerDragon.x + playerSize * 0.2 + this.dragon.x - enemySize * 0.2) / 2,
      this.playerHp.y - 4 - captionHeight - radius,
    );
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

  /** Where dragon attacks land: your dragon, in arena coordinates. */
  playerTarget(): PointData {
    return { x: this.playerDragon.x, y: this.playerDragon.y };
  }

  /** The attack countdown, in arena coordinates (knockback numbers float up from it). */
  chargePoint(): PointData {
    return { x: this.charge.x, y: this.charge.y };
  }
}
