import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { DIFFICULTY_INFO } from '../difficulty.ts';
import { MODE_LABEL, RESULT_LABEL } from '../history/labels.ts';
import { battleHistory, historyPersisted } from '../history/store.ts';
import { finalState, type Replay } from '../history/replay.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';

const ROW = 66;
const GAP = 8;
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });

export class HistoryScreen extends Container {
  private readonly back: Button;
  private readonly title = new Text({ text: 'Historia walk', style: { fontFamily: theme.headingFontFamily, fontSize: 27, fontWeight: '700', fill: theme.text } });
  private readonly intro = new Text({ text: '', style: { fontFamily: theme.fontFamily, fontSize: 15, fill: theme.textMuted, wordWrap: true } });
  private readonly list = new Container();
  private readonly viewport = new Container();
  private readonly clip = new Graphics();
  private readonly rows: Button[];
  private scroll = 0;
  private maxScroll = 0;
  private drag: { y: number; scroll: number } | null = null;
  private moved = false;

  constructor(private readonly options: { onBack: () => void; onReplay: (replay: Replay) => void }) {
    super();
    const entries = battleHistory();
    this.back = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.title.anchor.set(.5, 0);
    this.intro.text = entries.length ? `Ostatnie walki: ${entries.length}/30 · zapis na tym urządzeniu`
      : 'Tu pojawią się podsumowania i powtórki zakończonych walk.';
    if (!historyPersisted()) this.intro.text += '\nZapis lokalny jest niedostępny.';
    this.rows = entries.map(replay => new Button({
      text: `${RESULT_LABEL[finalState(replay).result]} · ${replay.title}`,
      subtitle: `${MODE_LABEL[replay.mode]} · ${DIFFICULTY_INFO[replay.difficulty].name} · ${dateFormat.format(replay.endedAt)}${replay.partial ? ' · część' : ''}`,
      onTap: () => { if (!this.moved) options.onReplay(replay); },
    }));
    this.list.addChild(...this.rows);
    this.viewport.addChild(this.clip, this.list);
    this.list.mask = this.clip;
    this.viewport.eventMode = 'static';
    this.viewport.on('pointerdown', (e: FederatedPointerEvent) => { this.drag = { y: e.global.y, scroll: this.scroll }; this.moved = false; });
    this.viewport.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const delta = this.drag.y - e.global.y;
      if (Math.abs(delta) > 8) this.moved = true;
      if (this.moved) this.scrollTo(this.drag.scroll + delta);
    });
    this.viewport.on('pointerup', () => { this.drag = null; });
    this.viewport.on('pointerupoutside', () => { this.drag = null; });
    this.viewport.on('pointercancel', () => { this.drag = null; });
    this.viewport.on('wheel', (e: FederatedWheelEvent) => this.scrollTo(this.scroll + e.deltaY));
    this.addChild(this.title, this.intro, this.back, this.viewport);
  }

  layout(width: number, height: number): void {
    const column = Math.min(460, width - 32), left = (width - column) / 2;
    this.title.position.set(width / 2, 14);
    this.back.position.set(12, 8); this.back.layout(48, 48);
    this.intro.position.set(left, 67); this.intro.style.wordWrapWidth = column;
    const top = 67 + this.intro.height + 12, view = Math.max(0, height - top - 12);
    this.viewport.position.set(left, top);
    this.viewport.hitArea = new Rectangle(0, 0, column, view);
    this.clip.clear().rect(0, 0, column, view).fill(0xffffff);
    this.rows.forEach((row, i) => { row.y = i * (ROW + GAP); row.layout(column, ROW); });
    this.maxScroll = Math.max(0, this.rows.length * (ROW + GAP) - GAP - view);
    this.scrollTo(this.scroll);
  }

  handleBack(): boolean { this.options.onBack(); return true; }
  handleKey(e: KeyboardEvent): void { if (e.key === 'Escape') this.handleBack(); }
  private scrollTo(n: number): void { this.scroll = Math.min(this.maxScroll, Math.max(0, n)); this.list.y = -this.scroll; }
}
