import { Container, Text, type DestroyOptions } from 'pixi.js';
import type { Difficulty } from '../../core/index.ts';
import { beginDaily, dailyRanking, flushDailyResults, type DailyRanking, type RankedRun } from '../net/daily.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { Modal } from '../ui/Modal.ts';
import { activeBattle, saveActiveBattle } from '../progress/store.ts';

const names = { easy: 'Łatwy', medium: 'Średni', hard: 'Trudny' };
function label(text: string, size = 18): Text {
  return new Text({ text, style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: size, fill: theme.text, align: 'center', wordWrap: true } });
}
export function rankedTime(ms: number): string { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${Math.floor(ms % 1000 / 100)}`; }
export class DailyScreen extends Container {
  private level: Difficulty;
  private generation = 0;
  private busy = false;
  private widthNow = 0;
  private heightNow = 0;
  private readonly title = label('Wyzwanie dnia', 28);
  private readonly status = label('Wczytywanie rankingu…', 15);
  private readonly rules = label('Wspólna plansza · dzień UTC\nCzas rankingu biegnie także podczas pauzy.\nLimit: 20 startów dziennie.', 14);
  private readonly rows = label('', 17);
  private readonly back: Button;
  private readonly play: Button;
  private readonly offline: Button;
  private readonly retry: Button;
  private readonly levels: Button[];
  private modal: Modal | null = null;
  constructor(private readonly options: { onBack: () => void; onOffline: () => void; onStart: (run: RankedRun) => void; level: Difficulty }) {
    super(); this.level = options.level;
    this.back = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.play = new Button({ text: 'Graj w rankingu', variant: 'primary', onTap: () => void this.start() });
    this.offline = new Button({ text: 'Graj offline', onTap: options.onOffline });
    this.retry = new Button({ text: 'Odśwież', onTap: () => void this.load() });
    this.levels = (['easy', 'medium', 'hard'] as Difficulty[]).map((level) => new Button({ text: names[level], onTap: () => {
      if (this.busy) return; this.level = level; void this.load();
    } }));
    for (const t of [this.title, this.status, this.rules, this.rows]) t.anchor.set(0.5, 0);
    this.rows.style.lineHeight = 26; this.rows.style.fontSize = 16;
    this.addChild(this.title, this.status, this.rules, this.rows, this.back, ...this.levels, this.play, this.offline, this.retry);
    void this.load();
  }
  layout(width: number, height: number): void {
    this.widthNow = width; this.heightNow = height;
    const column = Math.min(width - 32, 420), left = (width - column) / 2;
    this.back.position.set(12, 12); this.back.layout(44, 44);
    this.title.position.set(width / 2, 64); this.title.style.wordWrapWidth = column;
    this.rules.position.set(width / 2, 107); this.rules.style.wordWrapWidth = column;
    this.levels.forEach((b, i) => { b.position.set(left + i * (column + 8) / 3, 183); b.layout((column - 16) / 3, 46); b.setVariant(this.level === (['easy', 'medium', 'hard'][i]) ? 'primary' : 'secondary'); });
    this.status.position.set(width / 2, 243); this.status.style.wordWrapWidth = column;
    this.rows.position.set(width / 2, 283); this.rows.style.wordWrapWidth = column;
    for (const [i, button] of [this.play, this.offline, this.retry].entries()) {
      button.position.set(left, height - 16 - (3 - i) * 56); button.layout(column, 48);
    }
    this.modal?.layout(width, height);
  }
  private showRanking(ranking: DailyRanking): void {
    this.status.text = `${ranking.day} · ${ranking.players} graczy\n${ranking.own ? `Twoje miejsce: ${ranking.own.place} · ${rankedTime(ranking.own.elapsed_ms)}` : 'Nie masz jeszcze wyniku w tej kategorii.'}`;
    this.rows.text = ranking.top.map((r) => `${r.place}. ${r.mine ? 'Ty' : r.nickname.slice(0, 18)} · ${rankedTime(r.elapsed_ms)}`).join('\n') || 'Bądź pierwszym graczem!';
    this.layout(this.widthNow, this.heightNow);
  }
  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.play.setEnabled(false); this.status.text = 'Wczytywanie rankingu…'; this.rows.text = '';
    try {
      await flushDailyResults().catch(() => {});
      const ranking = await dailyRanking(this.level);
      if (this.destroyed || generation !== this.generation) return;
      this.showRanking(ranking); this.play.setEnabled(true);
    } catch { if (!this.destroyed && generation === this.generation) this.status.text = 'Ranking jest niedostępny.\nSpróbuj ponownie lub zagraj offline.'; }
  }
  private async start(replaceConfirmed = false): Promise<void> {
    if (this.modal || this.busy) return;
    if (activeBattle() && !replaceConfirmed) {
      this.modal = new Modal('Rozpocząć nową walkę?', 'Nowa próba zastąpi zapis solo.\nZegar rankingu ruszy po potwierdzeniu.', [
        { text: 'Rozpocznij nową', variant: 'primary', onTap: () => {
          this.closeModal(); void this.start(true);
        } },
        { text: 'Anuluj', onTap: () => this.closeModal() },
      ]);
      this.addChild(this.modal); this.modal.layout(this.widthNow, this.heightNow); this.modal.show(); return;
    }
    this.busy = true; this.play.setEnabled(false); this.retry.setEnabled(false);
    this.status.text = 'Przygotowuję wspólną planszę…';
    try {
      const run = await beginDaily(this.level);
      if (!this.destroyed) {
        if (replaceConfirmed) saveActiveBattle(null);
        this.options.onStart(run);
      }
    }
    catch (error) { if (!this.destroyed) this.status.text = (error as { code?: string }).code === 'daily-limit' ? 'Wykorzystano 20 startów na dziś.\nMożesz nadal grać offline.' : 'Nie udało się rozpocząć. Spróbuj ponownie.'; }
    finally { if (!this.destroyed) { this.busy = false; this.play.setEnabled(true); this.retry.setEnabled(true); } }
  }
  private closeModal(): void { this.modal?.destroy({ children: true }); this.modal = null; }
  handleKey(event: KeyboardEvent): void { if (event.key === 'Escape') this.handleBack(); }
  handleBack(): boolean { if (this.modal) this.closeModal(); else this.options.onBack(); return true; }
  override destroy(options?: DestroyOptions): void { this.generation++; super.destroy(options); }
}
