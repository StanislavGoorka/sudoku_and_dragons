import { Container, Text, type DestroyOptions } from 'pixi.js';
import { DUEL_RULES, type Difficulty, type Seat } from '../../core/index.ts';
import { DIFFICULTIES, DIFFICULTY_INFO, loadDifficulty, saveDifficulty } from '../difficulty.ts';
import {
  connect,
  errorMessage,
  fetchDuel,
  leaveDuel,
  localNickname,
  online,
  watchDuel,
  type DuelRow,
  type Joined,
  type Me,
} from '../net/online.ts';
import { DESIGNS } from '../art/dragonArt.ts';
import { chosenSkin, chosenTheme } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { theme } from '../theme.ts';
import { lessonSeen, markLessonSeen } from '../tutorial.ts';
import { Button } from '../ui/Button.ts';
import { Modal } from '../ui/Modal.ts';
import { DragonView } from '../ui/DragonView.ts';
import { Scene, SCENES } from '../ui/Scene.ts';
import { NumberPad } from '../ui/NumberPad.ts';

export interface LobbyOptions {
  onStart: (duel: DuelRow, seat: Seat, me: Me) => void;
  onMenu: () => void;
}

/** `duelId` and `code` are null while the server is still making the duel. */
type View =
  | { kind: 'offline'; message: string }
  | { kind: 'home'; message?: string }
  | { kind: 'searching'; duelId: string | null }
  | { kind: 'room'; duelId: string | null; code: string | null }
  | { kind: 'join'; code: string; message?: string }
  | { kind: 'joining'; code: string };

/** One line of the stacked layout: its height and how to place it in the column. */
interface Row {
  height: number;
  place(left: number, top: number, width: number): void;
}

/**
 * Where online duels start: quick match, a room with a code, or joining a friend's code. Every
 * button shows its result at once (the lobby, the search, the room); sign-in and the server's
 * answers catch up in the background.
 */
export class LobbyScreen extends Container {
  private readonly options: LobbyOptions;
  private readonly nickname = localNickname();
  private ready!: Promise<Me>;
  private difficulty: Difficulty = loadDifficulty();
  private view: View = { kind: 'home' };
  private content = new Container();
  private rows: Row[] = [];
  /** A line whose dots run while something is under way, e.g. "Szukam przeciwnika…". */
  private waiting: { text: Text; base: string } | null = null;
  private clock = 0;
  /** Bumped by every request and every cancel: an answer that comes back to a newer attempt is let go. */
  private attempt = 0;
  /** Round button in the top-left corner: the same as Back. */
  private readonly backButton: Button;
  private stopWatching: (() => void) | null = null;
  /** The duel rules, shown on the first visit and from their button. */
  private modal: Modal | null = null;
  private pollTimer: number | null = null;
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(options: LobbyOptions) {
    super();
    this.options = options;
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: () => this.handleBack() });
    this.addChild(this.content, this.backButton);
    this.connect();
    this.render();
    // Before the first duel, while no turn clock is running yet.
    if (!lessonSeen('duel')) this.showRules();
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.backButton.position.set(16, 12);
    this.backButton.layout(44, 44);
    const gap = 12;
    const columnWidth = Math.min(width - 48, 380);
    const left = (width - columnWidth) / 2;
    const total = this.rows.reduce((sum, row) => sum + row.height, 0) + gap * Math.max(0, this.rows.length - 1);
    let top = Math.max(24, (height - total) / 2);
    for (const row of this.rows) {
      row.place(left, top, columnWidth);
      top += row.height + gap;
    }
    this.modal?.layout(width, height);
  }

  update(deltaMs: number): void {
    this.clock += deltaMs / 1000;
    if (this.waiting) this.waiting.text.text = `${this.waiting.base}${'.'.repeat(1 + (Math.floor(this.clock * 2) % 3))}`;
  }

  handleBack(): boolean {
    const view = this.view;
    if (this.modal) {
      this.closeRules();
    } else if (view.kind === 'searching' || view.kind === 'room') {
      this.cancelWaiting();
    } else if (view.kind === 'joining') {
      this.cancelJoin(view.code);
    } else if (view.kind === 'join') {
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
      this.join(this.view.code);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.stopWaiting();
    super.destroy(options);
  }

  /** How a duel goes, in a few lines. Closing it the first time marks the lesson seen. */
  private showRules(): void {
    if (this.modal) return;
    const { movesPerTurn, turnSeconds, mistakeDamage, maxHp, maxIdleTurns } = DUEL_RULES;
    const rules = [
      'Gracie na jednej planszy, na zmianę.',
      `W swojej turze wpisujesz do ${movesPerTurn} dobrych cyfr, na co masz ${turnSeconds} s. Cyfra, która kończy wiersz, kolumnę albo kwadrat, daje dodatkowy ruch.`,
      `Dobra cyfra rani rywala o swoją wartość (5 to 5 HP), a ta, która domyka kwadrat 3×3, podwójnie. Zła kosztuje Ciebie ${mistakeDamage} HP i kończy turę.`,
      `Wygrywa, kto pierwszy zbije rywalowi ${maxHp} HP. ${maxIdleTurns + 1} przegapione tury z rzędu to poddanie.`,
    ];
    this.modal = new Modal('Zasady pojedynku', rules.join('\n\n'), [
      { text: 'Rozumiem', variant: 'primary', onTap: () => this.closeRules() },
    ]);
    this.addChild(this.modal);
    if (this.screenWidth > 0) this.modal.layout(this.screenWidth, this.screenHeight);
    this.modal.show();
  }

  private closeRules(): void {
    markLessonSeen('duel');
    this.modal?.destroy({ children: true });
    this.modal = null;
  }

  /** Signs in in the background; the lobby works meanwhile and requests wait for it. */
  private connect(): void {
    const ready = connect();
    this.ready = ready;
    ready.catch((error: unknown) => {
      // An idle lobby shows the failure at once; a request under way reports it itself.
      if (this.ready === ready && !this.destroyed && this.view.kind === 'home') {
        this.show({ kind: 'offline', message: errorMessage(error) });
      }
    });
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
    // Under the back button.
    this.addChildAt(this.content, 0);
    this.waiting = null;
    this.rows = [];

    const view = this.view;
    if (view.kind === 'home' || view.kind === 'searching') this.addHero();
    const title = this.addText('Pojedynek online', 34, theme.text, '800');
    title.style.stroke = { color: theme.panelLip, width: 6, join: 'round' };
    switch (view.kind) {
      case 'offline':
        this.addText(view.message, 16, theme.error);
        this.addButton('Spróbuj ponownie', () => {
          this.connect();
          this.show({ kind: 'home' });
        }, { variant: 'primary' });
        break;

      case 'home':
        this.addText(`Grasz jako: ${this.nickname}`, 15, theme.textMuted);
        this.addDifficultyPicker();
        this.addButton('Szybka gra', () => this.quickMatch(), { variant: 'primary', subtitle: 'losowy przeciwnik', height: 64 });
        this.addButton('Stwórz pokój', () => this.createRoom(), { subtitle: 'zaproś znajomego kodem', height: 64 });
        this.addButton('Dołącz kodem', () => this.show({ kind: 'join', code: '' }));
        this.addButton('Zasady pojedynku', () => this.showRules(), { height: 48 });
        if (view.message) this.addText(view.message, 15, theme.error);
        break;

      case 'searching':
        this.addWaiting('Szukam przeciwnika');
        this.addText(`Poziom: ${DIFFICULTY_INFO[this.difficulty].name.toLowerCase()}`, 15, theme.textMuted);
        this.addButton('Anuluj', () => this.cancelWaiting());
        break;

      case 'room':
        this.addText('Kod pokoju', 16, theme.textMuted);
        this.addText(view.code ? view.code.split('').join(' ') : '· · · ·', 56, theme.gold, '800');
        this.addText(
          view.code ? 'Podaj go znajomemu.\nPojedynek ruszy, gdy dołączy.' : 'Tworzę pokój…\nZaraz pojawi się kod.',
          15,
          theme.textMuted,
        );
        this.addButton('Anuluj', () => this.cancelWaiting());
        break;

      case 'join': {
        this.addText('Wpisz kod pokoju', 16, theme.textMuted);
        const slots = view.code.padEnd(4, '_').split('').join(' ');
        this.addText(slots, 52, theme.gold, '800');
        this.addNumberPad();
        if (view.message) this.addText(view.message, 15, theme.error);
        this.addButton('Dołącz', () => this.join(view.code), { variant: 'primary', enabled: view.code.length === 4 });
        this.addButton('⌫ Usuń', () => this.show({ kind: 'join', code: view.code.slice(0, -1) }));
        this.addButton('Anuluj', () => this.show({ kind: 'home' }));
        break;
      }

      case 'joining':
        this.addText('Kod pokoju', 16, theme.textMuted);
        this.addText(view.code.split('').join(' '), 52, theme.gold, '800');
        this.addWaiting('Dołączam');
        this.addButton('Anuluj', () => this.cancelJoin(view.code));
        break;
    }
  }

  /** The two duel dragons facing each other over the duel scene. */
  private addHero(): void {
    const hero = new Container();
    const scene = new Scene(SCENES.duel);
    const mine = new DragonView(chosenSkin(progress).design);
    const rival = new DragonView(DESIGNS['duel-rival']);
    mine.scale.x = -1;
    hero.addChild(scene, mine, rival);
    this.content.addChild(hero);
    const height = Math.round(Math.min(190, Math.max(120, this.screenHeight * 0.22)));
    this.rows.push({
      height,
      place: (left, top, width) => {
        hero.position.set(left, top);
        scene.layout(width, height, 22);
        const ground = scene.groundY() + 4;
        for (const [dragon, x] of [
          [mine, width * 0.25],
          [rival, width * 0.75],
        ] as const) {
          dragon.layout(Math.min(width * 0.42, (ground - 8) * 1.05));
          dragon.position.set(x, ground - dragon.footOffset());
        }
      },
    });
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

  private addWaiting(base: string): void {
    this.waiting = { text: this.addText(`${base}…`, 18, theme.text), base };
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
        if (enabled) onTap();
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
    const pad = new NumberPad((digit) => this.typeDigit(digit), chosenTheme(progress).colors);
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

  private quickMatch(): void {
    this.show({ kind: 'searching', duelId: null });
    void this.request(
      () => online.quickMatch(this.difficulty),
      (joined, me) => this.handleJoined(joined, me, { kind: 'searching', duelId: joined.duel.id }),
      (error) => ({ kind: 'home', message: errorMessage(error) }),
    );
  }

  private createRoom(): void {
    this.show({ kind: 'room', duelId: null, code: null });
    void this.request(
      () => online.createRoom(this.difficulty),
      (joined, me) => this.handleJoined(joined, me, { kind: 'room', duelId: joined.duel.id, code: joined.duel.code }),
      (error) => ({ kind: 'home', message: errorMessage(error) }),
    );
  }

  private join(code: string): void {
    if (code.length !== 4) return;
    this.show({ kind: 'joining', code });
    void this.request(
      () => online.joinRoom(code),
      (joined, me) => this.handleJoined(joined, me, { kind: 'home' }),
      (error) => ({ kind: 'join', code: '', message: errorMessage(error) }),
    );
  }

  /**
   * Sends a lobby request whose view is already on screen; failures show the view `onError` gives.
   * If the player moved on before the answer came, the duel it made is let go.
   */
  private async request(
    send: () => Promise<Joined>,
    onJoined: (joined: Joined, me: Me) => void,
    onError: (error: unknown) => View,
  ): Promise<void> {
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt && !this.destroyed;
    let me: Me;
    try {
      me = await this.ready;
    } catch (error) {
      if (current()) this.show({ kind: 'offline', message: errorMessage(error) });
      return;
    }
    let joined: Joined;
    try {
      joined = await send();
    } catch (error) {
      if (current()) this.show(onError(error));
      return;
    }
    if (!current()) {
      leaveDuel(joined.duel.id);
      return;
    }
    onJoined(joined, me);
  }

  /** Starts the duel right away, or waits for an opponent while showing `waitingView`. */
  private handleJoined(joined: Joined, me: Me, waitingView: View): void {
    if (joined.duel.status === 'playing') {
      this.options.onStart(joined.duel, joined.seat, me);
      return;
    }
    this.show(waitingView);
    const onRow = (row: DuelRow) => {
      if (row.status === 'playing') {
        this.stopWaiting();
        this.options.onStart(row, joined.seat, me);
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

  /** Back to the lobby at once; the server is told in the background. */
  private cancelWaiting(): void {
    const view = this.view;
    if (view.kind !== 'searching' && view.kind !== 'room') return;
    this.attempt++;
    this.stopWaiting();
    this.show({ kind: 'home' });
    // A stale waiting duel is cancelled by the server anyway after 30 minutes.
    if (view.duelId) leaveDuel(view.duelId);
  }

  private cancelJoin(code: string): void {
    this.attempt++;
    this.show({ kind: 'join', code });
  }
}
