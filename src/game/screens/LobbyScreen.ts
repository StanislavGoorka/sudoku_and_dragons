import { Container, Text, type DestroyOptions } from 'pixi.js';
import type { Difficulty, Seat } from '../../core/index.ts';
import { DIFFICULTIES, DIFFICULTY_INFO, loadDifficulty, saveDifficulty } from '../difficulty.ts';
import {
  connect,
  errorMessage,
  fetchDuel,
  online,
  watchDuel,
  type DuelRow,
  type Joined,
  type Me,
} from '../net/online.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';
import { NumberPad } from '../ui/NumberPad.ts';

export interface LobbyOptions {
  onStart: (duel: DuelRow, seat: Seat, me: Me) => void;
  onMenu: () => void;
}

type View =
  | { kind: 'connecting' }
  | { kind: 'offline'; message: string }
  | { kind: 'home'; message?: string }
  | { kind: 'searching'; duelId: string }
  | { kind: 'room'; duelId: string; code: string }
  | { kind: 'join'; code: string; message?: string };

/** One line of the stacked layout: its height and how to place it in the column. */
interface Row {
  height: number;
  place(left: number, top: number, width: number): void;
}

/** Where online duels start: quick match, a room with a code, or joining a friend's code. */
export class LobbyScreen extends Container {
  private readonly options: LobbyOptions;
  private me: Me | null = null;
  private difficulty: Difficulty = loadDifficulty();
  private view: View = { kind: 'connecting' };
  private content = new Container();
  private rows: Row[] = [];
  /** Animates the dots of "Szukam przeciwnika…". */
  private waitingText: Text | null = null;
  private clock = 0;
  private busy = false;
  private stopWatching: (() => void) | null = null;
  private pollTimer: number | null = null;
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(options: LobbyOptions) {
    super();
    this.options = options;
    this.addChild(this.content);
    this.render();
    void this.connect();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    const gap = 12;
    const columnWidth = Math.min(width - 48, 380);
    const left = (width - columnWidth) / 2;
    const total = this.rows.reduce((sum, row) => sum + row.height, 0) + gap * Math.max(0, this.rows.length - 1);
    let top = Math.max(24, (height - total) / 2);
    for (const row of this.rows) {
      row.place(left, top, columnWidth);
      top += row.height + gap;
    }
  }

  update(deltaMs: number): void {
    this.clock += deltaMs / 1000;
    if (this.waitingText) this.waitingText.text = `Szukam przeciwnika${'.'.repeat(1 + (Math.floor(this.clock * 2) % 3))}`;
  }

  handleBack(): boolean {
    if (this.view.kind === 'searching' || this.view.kind === 'room') {
      void this.cancelWaiting();
    } else if (this.view.kind === 'join') {
      this.show({ kind: 'home' });
    } else {
      this.options.onMenu();
    }
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.handleBack();
    } else if (this.view.kind === 'join' && /^[1-9]$/.test(event.key)) {
      this.typeDigit(Number(event.key));
    } else if (this.view.kind === 'join' && event.key === 'Backspace') {
      this.show({ kind: 'join', code: this.view.code.slice(0, -1) });
    } else if (this.view.kind === 'join' && event.key === 'Enter') {
      void this.join(this.view.code);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.stopWaiting();
    super.destroy(options);
  }

  private async connect(): Promise<void> {
    try {
      this.me = await connect();
      this.show({ kind: 'home' });
    } catch (error) {
      this.show({ kind: 'offline', message: errorMessage(error) });
    }
  }

  private show(view: View): void {
    if (this.destroyed) return;
    this.view = view;
    this.render();
    this.layout(this.screenWidth, this.screenHeight);
  }

  private render(): void {
    this.content.destroy({ children: true });
    this.content = new Container();
    this.addChild(this.content);
    this.waitingText = null;
    this.rows = [];

    this.addText('Pojedynek online', 30, theme.text, '800');
    const view = this.view;
    switch (view.kind) {
      case 'connecting':
        this.addText('Łączenie z serwerem…', 16, theme.textMuted);
        this.addButton('‹ Menu', () => this.options.onMenu());
        break;

      case 'offline':
        this.addText(view.message, 16, theme.error);
        this.addButton('Spróbuj ponownie', () => {
          this.show({ kind: 'connecting' });
          void this.connect();
        }, { variant: 'primary' });
        this.addButton('‹ Menu', () => this.options.onMenu());
        break;

      case 'home':
        this.addText(`Grasz jako: ${this.me?.nickname ?? ''}`, 15, theme.textMuted);
        this.addDifficultyPicker();
        this.addButton('Szybka gra', () => void this.quickMatch(), { variant: 'primary', subtitle: 'losowy przeciwnik', height: 64 });
        this.addButton('Stwórz pokój', () => void this.createRoom(), { subtitle: 'zaproś znajomego kodem', height: 64 });
        this.addButton('Dołącz kodem', () => this.show({ kind: 'join', code: '' }));
        if (view.message) this.addText(view.message, 15, theme.error);
        this.addButton('‹ Menu', () => this.options.onMenu());
        break;

      case 'searching':
        this.waitingText = this.addText('Szukam przeciwnika…', 18, theme.text);
        this.addText(`Poziom: ${DIFFICULTY_INFO[this.difficulty].name.toLowerCase()}`, 15, theme.textMuted);
        this.addButton('Anuluj', () => void this.cancelWaiting());
        break;

      case 'room':
        this.addText('Kod pokoju', 16, theme.textMuted);
        this.addText(view.code.split('').join(' '), 56, theme.boardFrame, '800');
        this.addText('Podaj go znajomemu.\nPojedynek ruszy, gdy dołączy.', 15, theme.textMuted);
        this.addButton('Anuluj', () => void this.cancelWaiting());
        break;

      case 'join': {
        this.addText('Wpisz kod pokoju', 16, theme.textMuted);
        const slots = view.code.padEnd(4, '_').split('').join(' ');
        this.addText(slots, 52, theme.boardFrame, '800');
        this.addNumberPad();
        if (view.message) this.addText(view.message, 15, theme.error);
        this.addButton('Dołącz', () => void this.join(view.code), { variant: 'primary', enabled: view.code.length === 4 });
        this.addButton('⌫ Usuń', () => this.show({ kind: 'join', code: view.code.slice(0, -1) }));
        this.addButton('Anuluj', () => this.show({ kind: 'home' }));
        break;
      }
    }
  }

  private addText(text: string, fontSize: number, fill: number, fontWeight: '400' | '700' | '800' = '400'): Text {
    const label = new Text({
      text,
      style: { fontFamily: theme.fontFamily, fontSize, fontWeight, fill, align: 'center', wordWrap: true },
    });
    label.anchor.set(0.5, 0);
    this.content.addChild(label);
    const lines = text.split('\n').length;
    this.rows.push({
      height: Math.ceil(fontSize * 1.3 * lines),
      place: (left, top, width) => {
        label.style.wordWrapWidth = width;
        label.position.set(left + width / 2, top);
      },
    });
    return label;
  }

  private addButton(
    text: string,
    onTap: () => void,
    options: { variant?: 'primary' | 'secondary'; subtitle?: string; height?: number; enabled?: boolean } = {},
  ): void {
    const enabled = options.enabled ?? true;
    const button = new Button({
      text,
      subtitle: options.subtitle,
      variant: options.variant,
      onTap: () => {
        if (enabled && !this.busy) onTap();
      },
    });
    button.alpha = enabled ? 1 : 0.4;
    this.content.addChild(button);
    const height = options.height ?? 50;
    this.rows.push({
      height,
      place: (left, top, width) => {
        button.position.set(left, top);
        button.layout(width, height);
      },
    });
  }

  private addDifficultyPicker(): void {
    const buttons = DIFFICULTIES.map((difficulty) => {
      const button = new Button({
        text: DIFFICULTY_INFO[difficulty].name,
        onTap: () => {
          this.difficulty = difficulty;
          saveDifficulty(difficulty);
          buttons.forEach((b, i) => b.setHighlighted(DIFFICULTIES[i] === difficulty));
        },
      });
      button.setHighlighted(difficulty === this.difficulty);
      this.content.addChild(button);
      return button;
    });
    this.rows.push({
      height: 44,
      place: (left, top, width) => {
        const gap = 8;
        const w = (width - gap * 2) / 3;
        buttons.forEach((button, i) => {
          button.position.set(left + i * (w + gap), top);
          button.layout(w, 44);
        });
      },
    });
  }

  private addNumberPad(): void {
    const pad = new NumberPad((digit) => this.typeDigit(digit));
    this.content.addChild(pad);
    this.rows.push({
      height: 52,
      place: (left, top, width) => {
        pad.position.set(left, top);
        pad.layout(width, 52);
      },
    });
  }

  private typeDigit(digit: number): void {
    if (this.view.kind !== 'join' || this.view.code.length >= 4) return;
    this.show({ kind: 'join', code: this.view.code + digit });
  }

  private async quickMatch(): Promise<void> {
    await this.run(async () => {
      const joined = await online.quickMatch(this.difficulty);
      this.handleJoined(joined, { kind: 'searching', duelId: joined.duel.id });
    });
  }

  private async createRoom(): Promise<void> {
    await this.run(async () => {
      const joined = await online.createRoom(this.difficulty);
      this.handleJoined(joined, { kind: 'room', duelId: joined.duel.id, code: joined.duel.code ?? '' });
    });
  }

  private async join(code: string): Promise<void> {
    if (code.length !== 4) return;
    try {
      this.busy = true;
      this.handleJoined(await online.joinRoom(code), { kind: 'home' });
    } catch (error) {
      this.show({ kind: 'join', code: '', message: errorMessage(error) });
    } finally {
      this.busy = false;
    }
  }

  /** Runs an online action, showing its error on the home view. */
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.show({ kind: 'home', message: errorMessage(error) });
    } finally {
      this.busy = false;
    }
  }

  /** Starts the duel right away, or waits for an opponent while showing `waitingView`. */
  private handleJoined(joined: Joined, waitingView: View): void {
    if (joined.duel.status === 'playing') {
      this.options.onStart(joined.duel, joined.seat, this.me!);
      return;
    }
    this.show(waitingView);
    const onRow = (row: DuelRow) => {
      if (row.status === 'playing') {
        this.stopWaiting();
        this.options.onStart(row, joined.seat, this.me!);
      } else if (row.status === 'cancelled') {
        this.stopWaiting();
        this.show({ kind: 'home' });
      }
    };
    this.stopWatching = watchDuel(joined.duel.id, onRow);
    // In case the live connection misses the moment someone joins.
    this.pollTimer = window.setInterval(() => void fetchDuel(joined.duel.id).then(onRow, () => {}), 3000);
  }

  private stopWaiting(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async cancelWaiting(): Promise<void> {
    const view = this.view;
    if (view.kind !== 'searching' && view.kind !== 'room') return;
    this.stopWaiting();
    this.show({ kind: 'home' });
    try {
      await online.leave(view.duelId);
    } catch {
      // A stale waiting duel is cancelled by the server anyway after 30 minutes.
    }
  }
}
