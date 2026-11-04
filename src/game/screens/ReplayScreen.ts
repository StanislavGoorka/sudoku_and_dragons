import { Container, Graphics, Text } from 'pixi.js';
import { MODE_LABEL, RESULT_LABEL, eventLabel, replayTime } from '../history/labels.ts';
import { finalState, summarizeReplay, type Replay } from '../history/replay.ts';
import { chosenTheme } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { drawPanel } from '../ui/panel.ts';

const text = (value: string, fontSize: number, fill: number = theme.text): Text => new Text({ text: value,
  style: { fontFamily: theme.fontFamily, fontSize, lineHeight: fontSize + 4, fill, wordWrap: true } });
const grid = (s: string) => Array.from(s, Number);

export class ReplayScreen extends Container {
  private readonly board: BoardView;
  private readonly summary: Text;
  private readonly subtitle: Text;
  private readonly info = text('', 14);
  private readonly panel = new Graphics();
  private readonly title = text('Analiza walki', 25);
  private readonly back: Button;
  private readonly prev: Button;
  private readonly play: Button;
  private readonly next: Button;
  private readonly speed: Button;
  private readonly restart: Button;
  private stepIndex = 0;
  private playing = false;
  private rate = 1;
  private wait = 0;

  constructor(private readonly replay: Replay, private readonly onBack: () => void) {
    super();
    const s = summarizeReplay(replay), end = finalState(replay);
    const duel = replay.mode === 'bot' || replay.mode === 'online';
    const duration = replay.elapsed - replay.initialAt;
    const tempo = !replay.partial && !duel && duration > 0 ? ` · ${Math.round(s.moves * 60000 / duration)} cyfr/min` : '';
    const known = replay.steps.some(step => step.event.kind !== 'gap');
    this.summary = text([
      `Koniec: Ty ${end.hp[0]} HP · rywal ${end.hp[1]} HP`,
      ...(replay.partial && !known ? ['Brak znanych ruchów do analizy.'] : [
        `${replay.partial ? 'Zapisane straty' : 'Straty'}: błędy ${s.mistakeHp} HP · ${duel ? `rywal ${s.rivalHp} HP` : `czas ${s.timerHp} HP`}`,
        `Ciosy za kwadraty: ${s.boxHp} HP (${s.boxes})`,
      ]),
      `${duel ? 'Czas obserwacji' : replay.partial ? 'Czas zapisu' : 'Czas walki'}: ${replayTime(duration)}${tempo}`,
      ...(replay.bestMs === null ? [] : [`Twój rekord (${replay.mode === 'campaign' ? 'etap' : 'poziom'}): ${replayTime(replay.bestMs)}`]),
    ].join('\n'), 14);
    this.subtitle = text(`${RESULT_LABEL[end.result]} · ${MODE_LABEL[replay.mode]}${replay.partial ? ' · zapis częściowy' : ''}`, 14, theme.gold);
    this.title.style.fontFamily = theme.headingFontFamily; this.title.style.fontWeight = '700'; this.title.style.wordWrap = false;
    this.title.anchor.set(.5, 0); this.subtitle.anchor.set(.5, 0); this.info.anchor.set(.5, 0); this.info.style.align = 'center';
    this.board = new BoardView(grid(replay.initial.board), chosenTheme(progress).colors);
    this.board.eventMode = 'none';
    this.back = new Button({ text: 'Wstecz', icon: 'back', onTap: onBack });
    this.prev = new Button({ text: 'Poprzedni', onTap: () => this.step(-1) });
    this.play = new Button({ text: 'Odtwórz', variant: 'primary', onTap: () => this.toggle() });
    this.next = new Button({ text: 'Następny', onTap: () => this.step(1) });
    this.speed = new Button({ text: 'Tempo 1×', onTap: () => { this.rate = this.rate === 4 ? 1 : this.rate * 2; this.speed.setText(`Tempo ${this.rate}×`); } });
    this.restart = new Button({ text: 'Od początku', onTap: () => { this.pause(); this.seek(0); } });
    this.addChild(this.panel, this.title, this.subtitle, this.summary, this.board, this.info, this.back, this.prev, this.play, this.next, this.speed, this.restart);
    this.seek(0);
  }

  layout(width: number, height: number): void {
    const column = Math.min(width - 28, 440), left = (width - column) / 2;
    this.back.position.set(12, 8); this.back.layout(48, 48);
    this.title.position.set(width / 2, 15);
    this.subtitle.position.set(width / 2, 54); this.subtitle.style.wordWrapWidth = column;
    const top = 76 + Math.max(0, this.subtitle.height - 18);
    this.summary.position.set(left + 12, top + 8); this.summary.style.wordWrapWidth = column - 24;
    const panelHeight = this.summary.height + 16;
    drawPanel(this.panel.clear(), left, top, column, panelHeight);
    const controls = height - 116, infoTop = controls - 56;
    this.info.position.set(width / 2, infoTop); this.info.style.wordWrapWidth = column;
    const boardTop = top + panelHeight + 16, size = Math.max(1, Math.min(column - 12, infoTop - 22 - boardTop));
    this.board.position.set((width - size) / 2, boardTop); this.board.layout(size);
    const third = (column - 14) / 3, half = (column - 7) / 2;
    [this.prev, this.play, this.next].forEach((b, i) => { b.position.set(left + i * (third + 7), controls); b.layout(third, 48); });
    [this.speed, this.restart].forEach((b, i) => { b.position.set(left + i * (half + 7), controls + 54); b.layout(half, 48); });
  }

  update(deltaMs: number): void {
    if (!this.playing) return;
    this.wait += deltaMs * this.rate;
    while (this.playing && this.stepIndex < this.replay.steps.length) {
      const next = this.replay.steps[this.stepIndex];
      const prevAt = this.replay.steps[this.stepIndex - 1]?.at ?? this.replay.initialAt;
      const delay = Math.min(1400, Math.max(300, next.at - prevAt));
      if (this.wait < delay) break;
      this.wait -= delay; this.seek(this.stepIndex + 1);
    }
  }

  pause(): void { this.playing = false; this.play.setText('Odtwórz'); }
  handleBack(): boolean { this.onBack(); return true; }
  handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.handleBack();
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
  }
  private toggle(): void {
    if (!this.replay.steps.length) return;
    if (this.playing) { this.pause(); return; }
    if (this.stepIndex === this.replay.steps.length) this.seek(0);
    this.wait = 0; this.playing = true; this.play.setText('Pauza');
  }
  private step(delta: number): void { this.pause(); this.seek(this.stepIndex + delta); }
  private seek(stepIndex: number): void {
    const forward = stepIndex > this.stepIndex;
    this.stepIndex = Math.min(this.replay.steps.length, Math.max(0, stepIndex));
    const step = this.replay.steps[this.stepIndex - 1], state = step?.state ?? this.replay.initial;
    const e = step?.event;
    this.board.selected = e?.kind === 'correct' || e?.kind === 'wrong' ? e.cell : null;
    this.board.sync(grid(state.board), forward && e?.kind === 'correct' ? e.actor === 0 ? 'mine' : 'rival' : 'given');
    this.info.text = `${this.stepIndex}/${this.replay.steps.length} · HP ${state.hp[0]} : ${state.hp[1]}\n${eventLabel(e)}`;
    this.prev.setEnabled(this.stepIndex > 0); this.next.setEnabled(this.stepIndex < this.replay.steps.length);
    this.play.setEnabled(this.replay.steps.length > 0); this.speed.setEnabled(this.replay.steps.length > 0);
    if (this.stepIndex === this.replay.steps.length) this.pause();
  }
}
