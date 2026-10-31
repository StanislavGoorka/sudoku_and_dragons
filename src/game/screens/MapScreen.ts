import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { REGIONS, STAGES, type Region, type Stage } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { lookOf } from '../enemies.ts';
import { killTweens } from '../fx/tweens.ts';
import { currentStage, isStageUnlocked, stageRecord } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { DragonView } from '../ui/DragonView.ts';
import { drawLock } from '../ui/lock.ts';
import { Scene, SCENES } from '../ui/Scene.ts';
import { drawStar } from '../ui/stars.ts';

export interface MapOptions {
  onBack: () => void;
  /** An open stage was tapped: fight it. */
  onPick: (stage: Stage) => void;
}

const PANEL_HEIGHT = 250;
const PANEL_GAP = 16;
/** Where each stage's node sits in its region's panel (fractions), along a winding path; the boss last. */
const NODES: [number, number][] = [
  [0.16, 0.66],
  [0.39, 0.4],
  [0.62, 0.68],
  [0.84, 0.42],
];
/** A finger that moved this far is scrolling, not tapping a node. */
const DRAG_SLOP = 8;

function label(text: string, fontSize: number, fill: number, fontWeight: '500' | '700' | '600' = '600'): Text {
  return new Text({
    text,
    style: { fontFamily: theme.fontFamily, fontWeight, fontSize, fill },
  });
}

/** One stage on the map: its dragon in a round frame, stars under it, a lock until it opens. */
class StageNode extends Container {
  readonly stage: Stage;
  private readonly frame = new Graphics();
  private readonly mask_ = new Graphics();
  private readonly dragon: DragonView;
  private readonly marks = new Graphics();
  private readonly bossLabel: Text | null;
  private readonly open: boolean;
  private readonly next: boolean;

  constructor(stage: Stage) {
    super();
    this.stage = stage;
    this.open = isStageUnlocked(progress, stage);
    this.next = stage === currentStage(progress) && stageRecord(progress, stage).wins === 0;
    this.dragon = new DragonView(lookOf(stage.enemy, stage).design, { idle: false });
    // Dragons face left; on the map they look along the path, to the right.
    this.dragon.scale.x = -1;
    if (!this.open) this.dragon.tint = 0x1b1338;
    this.dragon.mask = this.mask_;
    this.bossLabel = stage.boss ? label('Boss', 15, theme.gold) : null;
    this.bossLabel?.anchor.set(0.5, 1);
    this.addChild(this.frame, this.mask_, this.dragon, this.marks);
    if (this.bossLabel) this.addChild(this.bossLabel);
  }

  layout(radius: number): void {
    const r = this.stage.boss ? radius * 1.22 : radius;
    const ring = this.next ? theme.buttonPrimary : theme.panelLight;
    this.frame
      .clear()
      .circle(0, 0, r)
      .fill(theme.panel)
      .stroke({ width: this.next ? 2 : 1, color: ring });
    this.mask_.clear().circle(0, 0, r).fill(0xffffff);
    this.dragon.layout(r * 2.3);
    this.dragon.position.set(-r * 0.05, r * 0.15);
    this.marks.clear();
    if (!this.open) {
      drawLock(this.marks, 0, r * 0.05, r * 0.95);
    } else {
      const best = stageRecord(progress, this.stage).bestStars;
      for (let i = 0; i < 3; i++) drawStar(this.marks, (i - 1) * r * 0.55, r + 14, r * 0.24, i < best);
    }
    this.bossLabel?.position.set(0, -r - 6);
    this.hitArea = new Rectangle(-r - 6, -r - 6, r * 2 + 12, r * 2 + 28);
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.frame, this);
    super.destroy(options);
  }
}

/** A region on the map: its scene, its name and progress, and its stages along a dotted path. */
class RegionPanel extends Container {
  readonly region: Region;
  readonly nodes: StageNode[];
  private readonly scene: Scene;
  private readonly panel = new Graphics();
  private readonly path = new Graphics();
  private readonly title: Text;
  private readonly count: Text;
  private readonly shade = new Graphics();
  private readonly note: Text | null;

  constructor(region: Region, onTap: (node: StageNode) => void) {
    super();
    this.region = region;
    this.scene = new Scene(SCENES[region.scene] ?? SCENES.dragon);
    this.scene.visible = false;
    this.title = label(region.name, 22, theme.text);
    const won = region.stages.filter((stage) => stageRecord(progress, stage).wins > 0).length;
    this.count = label(`${won}/${region.stages.length}`, 18, won === region.stages.length ? theme.gold : theme.text);
    this.count.anchor.set(1, 0);
    this.nodes = region.stages.map((stage) => {
      const node = new StageNode(stage);
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => onTap(node));
      return node;
    });
    // A region not reached yet is dimmed and says which boss opens it.
    const first = region.stages[0];
    const before = STAGES[STAGES.indexOf(first) - 1];
    this.note = isStageUnlocked(progress, first) ? null : label(`Pokonaj bossa: ${before.enemy.name}`, 15, theme.textMuted, '700');
    this.note?.anchor.set(0.5, 0.5);
    this.addChild(this.scene, this.panel, this.path, ...this.nodes, this.shade, this.title, this.count);
    if (this.note) this.addChild(this.note);
  }

  layout(width: number): void {
    const h = PANEL_HEIGHT;
    this.scene.layout(width, h, 22);
    this.panel.clear().roundRect(0, 0, width, h, 12).fill(theme.panel).stroke({ width: 1, color: theme.panelLight });
    this.title.position.set(14, 10);
    this.count.position.set(width - 14, 12);
    const radius = Math.max(22, Math.min(34, width * 0.075));
    const points = NODES.map(([fx, fy]) => ({ x: fx * width, y: fy * h }));
    this.nodes.forEach((node, i) => {
      node.position.set(points[i].x, points[i].y);
      node.layout(radius);
    });
    // Dots between the nodes along gentle curves.
    this.path.clear();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const lit = stageRecord(progress, this.region.stages[i]).wins > 0;
      this.path.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: lit ? theme.buttonPrimary : theme.panelLight });
    }
    this.shade.clear();
    if (this.note) {
      this.shade.roundRect(0, 0, width, h, 22).fill({ color: theme.background, alpha: 0.45 });
      this.note.position.set(width / 2, h - 22);
    }
  }
}

/**
 * The campaign map: the three regions top to bottom, each with its dragons along a path (stars won,
 * a lock until a stage opens, a gold ring on the one to play next). It scrolls with a drag or the
 * mouse wheel and opens at the region being played; tapping an open stage starts its battle.
 */
export class MapScreen extends Container {
  private readonly options: MapOptions;
  private readonly backButton: Button;
  private readonly title = new Text({
    text: 'Mapa',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '600',
      fontSize: 28,
      fill: theme.text,
    },
  });
  private readonly summary: Text;
  private readonly viewport = new Container();
  private readonly list = new Container();
  private readonly listMask = new Graphics();
  private readonly panels: RegionPanel[];
  private scroll = 0;
  private maxScroll = 0;
  private drag: { y: number; scroll: number; moved: boolean } | null = null;
  private placed = false;

  constructor(options: MapOptions) {
    super();
    this.options = options;
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.title.anchor.set(0.5, 0);
    const stars = STAGES.reduce((sum, stage) => sum + stageRecord(progress, stage).bestStars, 0);
    this.summary = new Text({
      text: `Gwiazdki kampanii: ${stars} z ${STAGES.length * 3}`,
      style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 15, fill: theme.textMuted },
    });
    this.summary.anchor.set(0.5, 0);
    this.panels = REGIONS.map((region) => new RegionPanel(region, (node) => this.tap(node)));
    this.list.addChild(...this.panels);
    this.list.mask = this.listMask;
    this.viewport.addChild(this.listMask, this.list);
    this.viewport.eventMode = 'static';
    this.viewport.on('pointerdown', (event: FederatedPointerEvent) => (this.drag = { y: event.global.y, scroll: this.scroll, moved: false }));
    this.viewport.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (!this.drag) return;
      const dy = this.drag.y - event.global.y;
      if (Math.abs(dy) > DRAG_SLOP) this.drag.moved = true;
      if (this.drag.moved) this.scrollTo(this.drag.scroll + dy);
    });
    // Let a tap reach the node first, then forget the drag.
    this.viewport.on('pointerup', () => setTimeout(() => (this.drag = null), 0));
    this.viewport.on('pointerupoutside', () => (this.drag = null));
    this.viewport.on('wheel', (event: FederatedWheelEvent) => this.scrollTo(this.scroll + event.deltaY));
    this.addChild(this.viewport, this.backButton, this.title, this.summary);
  }

  layout(width: number, height: number): void {
    const margin = 16;
    const column = Math.min(width - margin * 2, 440);
    const left = (width - column) / 2;
    this.backButton.position.set(margin, 12);
    this.backButton.layout(44, 44);
    this.title.position.set(width / 2, 14);
    this.summary.position.set(width / 2, 58);

    const top = 88;
    const viewHeight = Math.max(0, height - top - margin);
    this.viewport.position.set(left, top);
    this.viewport.hitArea = new Rectangle(0, 0, column, viewHeight);
    this.listMask.clear().rect(-8, 0, column + 16, viewHeight).fill(0xffffff);
    this.panels.forEach((panel, i) => {
      panel.position.set(0, i * (PANEL_HEIGHT + PANEL_GAP));
      panel.layout(column);
    });
    this.maxScroll = Math.max(0, this.panels.length * (PANEL_HEIGHT + PANEL_GAP) - PANEL_GAP - viewHeight);
    if (!this.placed) {
      // Open at the region being played.
      this.placed = true;
      const index = REGIONS.indexOf(currentStage(progress).region);
      this.scroll = index * (PANEL_HEIGHT + PANEL_GAP) - (viewHeight - PANEL_HEIGHT) / 2;
    }
    this.scrollTo(this.scroll);
  }

  handleBack(): boolean {
    this.options.onBack();
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.options.onBack();
  }

  private tap(node: StageNode): void {
    if (this.drag?.moved) return;
    if (!isStageUnlocked(progress, node.stage)) {
      feedback.mistake();
      gsap.fromTo(node, { x: node.x - 6 }, { x: node.x, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
      return;
    }
    feedback.tap();
    this.options.onPick(node.stage);
  }

  private scrollTo(scroll: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, scroll));
    this.list.y = -this.scroll;
  }
}
