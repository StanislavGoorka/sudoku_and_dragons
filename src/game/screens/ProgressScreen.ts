import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { ACHIEVEMENTS, isAchieved, LEVELS, type Achievement } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';
import { drawStar, StarCounter } from '../ui/stars.ts';

export interface ProgressOptions {
  onBack: () => void;
}

const ROW_HEIGHT = 68;
const ROW_GAP = 8;

function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function label(text: string, fontSize: number, fill: number, fontWeight: '500' | '700' | '800' = '500'): Text {
  return new Text({ text, style: { fontFamily: theme.fontFamily, fontSize, fontWeight, fill } });
}

/** One achievement: a medal, its name and goal, and its reward (or how far along it is). */
class AchievementRow extends Container {
  private readonly bg = new Graphics();
  private readonly medal = new Graphics();
  private readonly title: Text;
  private readonly description: Text;
  private readonly side: Text;
  private readonly sideStar = new Graphics();
  private readonly bar = new Graphics();
  private readonly done: boolean;
  private readonly fraction: number;

  constructor(achievement: Achievement) {
    super();
    this.done = isAchieved(progress, achievement);
    const [current, target] = achievement.progress(progress);
    this.fraction = Math.min(1, current / target);
    this.title = label(achievement.title, 16, this.done ? theme.text : theme.textMuted, '800');
    this.description = label(achievement.description, 13, theme.textMuted);
    this.side = label(this.done ? `+${achievement.reward}` : `${current}/${target}`, 15, this.done ? theme.gold : theme.textMuted, '800');
    this.side.anchor.set(1, 0.5);
    this.addChild(this.bg, this.medal, this.title, this.description, this.bar, this.side, this.sideStar);
  }

  layout(width: number): void {
    const h = ROW_HEIGHT;
    this.bg.clear().roundRect(0, 0, width, h, 16).fill(this.done ? theme.panel : { color: theme.panel, alpha: 0.55 });
    // A gold medal with a star when done, an empty dark one otherwise.
    const mx = 34;
    const my = h / 2;
    this.medal.clear().circle(mx, my, 21).fill(this.done ? theme.buttonPrimaryLip : theme.hpTrack);
    this.medal.circle(mx, my - 2, 19).fill(this.done ? theme.gold : theme.panelLip);
    drawStar(this.medal, mx, my - 2, 11, this.done);

    const textX = 66;
    const right = width - 14;
    this.side.position.set(this.done ? right - 20 : right, h / 2);
    this.sideStar.clear();
    if (this.done) drawStar(this.sideStar, right - 8, h / 2, 8);
    const textWidth = right - 56 - textX;
    this.title.position.set(textX, 10);
    this.description.position.set(textX, 33);
    this.description.style.wordWrap = true;
    this.description.style.wordWrapWidth = textWidth;
    this.bar.clear();
    if (!this.done && this.fraction > 0) {
      this.bar.roundRect(textX, h - 9, textWidth, 4, 2).fill(theme.hpTrack).roundRect(textX, h - 9, textWidth * this.fraction, 4, 2).fill(theme.gold);
    }
  }
}

/**
 * The player's progress: stars to spend, a few numbers about their fights, and the achievements
 * (done ones first), in a list that scrolls with a finger drag or the mouse wheel.
 */
export class ProgressScreen extends Container {
  private readonly options: ProgressOptions;
  private readonly backButton: Button;
  private readonly title = label('Postępy', 34, theme.text, '800');
  private readonly stars = new StarCounter(progress.stars);
  private readonly statsPanel = new Graphics();
  private readonly stats: { value: Text; caption: Text }[];
  private readonly heading: Text;
  private readonly viewport = new Container();
  private readonly list = new Container();
  private readonly listMask = new Graphics();
  private readonly rows: AchievementRow[];
  private scroll = 0;
  private maxScroll = 0;
  private dragFrom: { y: number; scroll: number } | null = null;

  constructor(options: ProgressOptions) {
    super();
    this.options = options;
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: options.onBack });
    this.title.anchor.set(0.5, 0);
    this.title.style.stroke = { color: theme.panelLip, width: 6, join: 'round' };

    const wins = LEVELS.reduce((sum, d) => sum + progress.levels[d].wins, 0);
    const times = LEVELS.map((d) => progress.levels[d].bestTime).filter((t): t is number => t !== null);
    this.stats = [
      [String(wins), 'wygrane walki'],
      [`${progress.duels.won}/${progress.duels.played}`, 'pojedynki'],
      [times.length ? formatTime(Math.min(...times)) : '–', 'najlepszy czas'],
    ].map(([value, caption]) => {
      const valueText = label(value, 26, theme.text, '800');
      const captionText = label(caption, 13, theme.textMuted);
      valueText.anchor.set(0.5, 0);
      captionText.anchor.set(0.5, 0);
      return { value: valueText, caption: captionText };
    });

    const done = ACHIEVEMENTS.filter((a) => isAchieved(progress, a)).length;
    this.heading = label(`Osiągnięcia ${done}/${ACHIEVEMENTS.length}`, 20, theme.text, '800');
    // Done first (newest on top), then the rest in their usual order.
    const sorted = [...ACHIEVEMENTS].sort((a, b) => (progress.achievements[b.id] ?? 0) - (progress.achievements[a.id] ?? 0));
    this.rows = sorted.map((achievement) => new AchievementRow(achievement));
    this.list.addChild(...this.rows);
    this.list.mask = this.listMask;
    this.viewport.addChild(this.listMask, this.list);
    this.viewport.eventMode = 'static';
    this.viewport.on('pointerdown', (event: FederatedPointerEvent) => (this.dragFrom = { y: event.global.y, scroll: this.scroll }));
    this.viewport.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (this.dragFrom) this.scrollTo(this.dragFrom.scroll + this.dragFrom.y - event.global.y);
    });
    this.viewport.on('pointerup', () => (this.dragFrom = null));
    this.viewport.on('pointerupoutside', () => (this.dragFrom = null));
    this.viewport.on('wheel', (event: FederatedWheelEvent) => this.scrollTo(this.scroll + event.deltaY));

    this.addChild(this.statsPanel, ...this.stats.flatMap((s) => [s.value, s.caption]), this.title, this.stars, this.heading, this.viewport, this.backButton);
  }

  layout(width: number, height: number): void {
    const margin = 16;
    const column = Math.min(width - margin * 2, 440);
    const left = (width - column) / 2;
    this.backButton.position.set(margin, 12);
    this.backButton.layout(44, 44);
    this.title.position.set(width / 2, 14);

    this.stars.layout(46);
    this.stars.position.set(width / 2 - this.stars.pillWidth / 2, 70);

    const panelY = 130;
    const panelHeight = 74;
    this.statsPanel.clear().roundRect(left, panelY + 5, column, panelHeight, 18).fill(theme.panelLip).roundRect(left, panelY, column, panelHeight, 18).fill(theme.panel);
    this.stats.forEach(({ value, caption }, i) => {
      const x = left + (column / 3) * (i + 0.5);
      value.position.set(x, panelY + 10);
      caption.position.set(x, panelY + 46);
    });

    const headingY = panelY + panelHeight + 20;
    this.heading.position.set(left + 4, headingY);
    const listTop = headingY + 36;
    const viewHeight = Math.max(0, height - listTop - margin);
    this.viewport.position.set(left, listTop);
    this.viewport.hitArea = new Rectangle(0, 0, column, viewHeight);
    this.listMask.clear().rect(0, 0, column, viewHeight).fill(0xffffff);
    this.rows.forEach((row, i) => {
      row.position.set(0, i * (ROW_HEIGHT + ROW_GAP));
      row.layout(column);
    });
    this.maxScroll = Math.max(0, this.rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP - viewHeight);
    this.scrollTo(this.scroll);
  }

  handleBack(): boolean {
    this.options.onBack();
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.options.onBack();
  }

  private scrollTo(scroll: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, scroll));
    this.list.y = -this.scroll;
  }
}
