import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { closesBox, DUEL_RULES, otherSeat, solve, type DuelEvent, type DuelState, type Seat, type Unit } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { isAppActive } from '../activity.ts';
import type { TrackId } from '../audio/tracks.ts';
import { rivalDesign } from '../dragonSkins.ts';
import { floatText, shake, stopEffects, wait } from '../fx/effects.ts';
import { fireShot } from '../fx/hitEffects.ts';
import { killTweens } from '../fx/tweens.ts';
import { DuelSync, type Prediction, type Snapshot } from '../net/duelSync.ts';
import { onlineDuels, type DuelBackend } from '../net/duelBackend.ts';
import { errorMessage, OnlineError, supabase, type DuelConnectionState, type DuelRow, type Me } from '../net/online.ts';
import { forgetDuel, rememberDuel } from '../net/duelRecovery.ts';
import { OVERSCAN } from '../safeArea.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { DuelArena } from '../ui/DuelArena.ts';
import { Modal } from '../ui/Modal.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { chosenEffect, chosenSkin, chosenTheme, type Reward } from '../progress/progress.ts';
import { rewardLines } from '../progress/rewardText.ts';
import { progress, recordDuelOnce } from '../progress/store.ts';
import { fightLayout } from './fightLayout.ts';

export interface DuelScreenOptions {
  /** Back to the online lobby for another duel. */
  onLobby: () => void;
  onMenu: () => void;
  /** Both players asked for a rematch: open the new duel. */
  onRematch: (duel: DuelRow, seat: Seat) => void;
  /** Who judges the duel: the server (the default), or the device for training with a bot. */
  backend?: DuelBackend;
}

/** What the server says about a rematch once the duel is over. */
interface RematchState {
  /** Seat that asked first. */
  by: Seat | null;
  declined: boolean;
  /** The new duel, once both asked. */
  next: string | null;
}

const TURN_MS = DUEL_RULES.turnSeconds * 1000;
/** How long the rival's dragon waits for their profile before it comes in the default look. */
const RIVAL_PROFILE_WAIT_MS = 1500;
/** Request failures worth another try: the server may simply not have been reached. */
const RETRIED = new Set(['network', 'server-error', 'conflict', 'not-yet']);

function snapshotOf(row: DuelRow): Snapshot {
  return {
    state: row.state,
    version: row.version,
    turnStartedAt: row.turn_started_at ? Date.parse(row.turn_started_at) : null,
  };
}

/** Why the server did not take a move, in Polish. */
function refusalMessage(error: unknown): string {
  const code = error instanceof OnlineError ? error.code : 'network';
  return code === 'network' || code === 'server-error' || code === 'too-late' ? errorMessage(error) : 'Ruch cofnięty';
}

/**
 * An online duel on a shared board. Own moves and turns running out are shown at once, predicted
 * locally (see DuelSync); the server judges everything and its answer confirms the prediction or
 * replaces it. The rival's moves are played out as their new versions of the duel arrive.
 */
export class DuelScreen extends Container {
  readonly music: TrackId = 'duel';
  private readonly duelId: string;
  private readonly backend: DuelBackend;
  private readonly me: Me;
  private readonly seat: Seat;
  private readonly options: DuelScreenOptions;
  private readonly sync: DuelSync;
  /** The event behind the last confirmed version. */
  private lastEvent: DuelEvent | null;
  private rivalName = 'Rywal';
  /** How the rival's hits fly (their profile's effect; the default until it is read). */
  private rivalEffect: string | null = null;

  private readonly arena: DuelArena;
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  private readonly fx = new Container();
  private readonly hurtFlash = new Graphics();
  /** Round button in the scene's corner: give up (asks first), or leave a finished duel. */
  private readonly leaveButton: Button;
  /** Round button in the other corner: notes mode on (gold) or off. Notes stay on this device. */
  private readonly notesButton: Button;
  private notesMode = false;
  private modal: Modal | null = null;
  private rematch: RematchState;
  /** We asked for a rematch and wait for the rival. */
  private rematchAsked = false;
  /** On the way to the rematch duel: ignore further updates. */
  private switching = false;
  /** The end dialog's title and message before any rematch news is added. */
  private endTitle = '';
  private endMessage = '';
  /** The rival gave up, so the end message already says they left. */
  private rivalLeft = false;
  /** "Rewanż!" over the board while the server deals the new one. */
  private intro: Container | null = null;

  /** A prediction is on its way to the server; the next one waits for the answer. */
  private sending = false;
  private sendTimer: number | undefined;
  /** Bumped whenever predictions are taken back, so hits still in flight show the real HP. */
  private epoch = 0;
  /** performance.now() when the shown duel ended, to time the end sequence from the last hit. */
  private finishShownAt: number | null = null;
  /** Deadline of the last timeout announced, and start of the last own turn announced: never twice. */
  private announcedTimeout: number | null = null;
  private announcedTurn: number | null;
  private endShown = false;
  private lastTick: number | null = null;
  private readonly stopWatching: () => void;
  private readonly pollTimer: number;
  private readonly rivalTimer: number;
  private screenWidth = 0;
  private screenHeight = 0;
  private connection: DuelConnectionState = 'connected';
  private refreshing = false;
  private reward: Reward | null = null;
  private readonly connectionLabel = new Text({ text: '', style: {
    fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 14, fill: theme.textMuted,
  } });
  private readonly onOnline = () => this.resume();
  private readonly onOffline = () => this.setConnection('offline');

  constructor(row: DuelRow, me: Me, seat: Seat, options: DuelScreenOptions) {
    super();
    this.duelId = row.id;
    this.backend = options.backend ?? onlineDuels;
    this.me = me;
    this.seat = seat;
    this.options = options;
    if (this.backend.ranked) rememberDuel(row, me);
    // The board has one solution, so the client finds it too; it only predicts with it.
    const solution = solve(row.state.board);
    if (!solution) throw new Error(`Duel ${row.id} has an unsolvable board`);
    this.sync = new DuelSync(snapshotOf(row), seat, solution);
    this.lastEvent = row.last_event;
    this.announcedTurn = this.sync.confirmed.turnStartedAt;
    this.rematch = { by: row.rematch_by, declined: row.rematch_declined, next: row.next_duel };

    this.leaveButton = new Button({ text: 'Wyjdź', icon: 'back', onTap: () => this.requestLeave() });
    this.notesButton = new Button({ text: 'Notatki', icon: 'pencil', onTap: () => this.toggleNotes() });
    // The rival as last seen this session (a rematch), until their profile is read again.
    const rivalId = seat === 0 ? row.player1 : row.player0;
    const known = rivalId ? this.backend.knownProfile(rivalId) : undefined;
    if (known) {
      this.rivalName = known.nickname;
      this.rivalEffect = known.effect;
    }
    this.arena = new DuelArena(me.nickname, this.rivalName, DUEL_RULES.maxHp, chosenSkin(progress).design);
    if (known) this.arena.showRival(rivalDesign(known.dragon));
    this.arena.hpBar(true).setHp(this.state.hp[seat]);
    this.arena.hpBar(false).setHp(this.state.hp[otherSeat(seat)]);
    const colors = chosenTheme(progress).colors;
    this.board = new BoardView(row.state.board, colors);
    this.pad = new NumberPad((digit) => this.handleDigit(digit), colors);
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;
    this.addChild(this.arena, this.leaveButton, this.notesButton, this.board, this.pad, this.hurtFlash, this.fx);
    this.connectionLabel.anchor.set(0.5, 0);
    this.connectionLabel.visible = this.backend.ranked;
    this.addChild(this.connectionLabel);

    this.stopWatching = this.backend.watch(this.duelId, (next) => this.applyRow(next), (state) => this.setConnection(state));
    // A safety net for missed live updates: during the duel, and after it while a rematch is still possible.
    this.pollTimer = window.setInterval(() => {
      if (!isAppActive() || this.sending || this.switching || this.rematch.declined) return;
      void this.refresh();
    }, 4000);
    if (rivalId) {
      void this.backend.fetchProfile(rivalId).then((profile) => {
        if (this.destroyed) return;
        this.rivalName = profile.nickname;
        this.rivalEffect = profile.effect;
        this.arena.setRivalName(profile.nickname);
        this.showRivalDragon(profile.dragon);
      });
    }
    // A slow profile: the rival comes in the default look, and changes if their skin turns up.
    this.rivalTimer = window.setTimeout(() => {
      if (!this.arena.rivalShown) this.showRivalDragon(null);
    }, RIVAL_PROFILE_WAIT_MS);
    this.showState(this.state);
    this.updateTurn(false);
    if (this.backend.ranked) {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      this.setConnection(navigator.onLine ? 'connecting' : 'offline');
      void this.refresh();
    }
    if (row.state.finished) {
      if (!this.arena.rivalShown) this.arena.showRival(rivalDesign(null));
      void this.showEnd(row.last_event);
    }
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const statusHeight = this.backend.ranked ? 24 : 0;
    const areas = fightLayout(width, height - statusHeight);
    const { arenaHeight, boardSize, padHeight, left, columnWidth } = areas;
    const arenaY = areas.arenaY + statusHeight;
    const boardY = areas.boardY + statusHeight;
    const padY = areas.padY + statusHeight;
    this.connectionLabel.position.set(width / 2, 3);
    const buttonSize = 48;
    this.leaveButton.position.set(left + 7, arenaY + 5);
    this.leaveButton.layout(buttonSize, buttonSize);
    this.notesButton.position.set(left + columnWidth - 7 - buttonSize, arenaY + 5);
    this.notesButton.layout(buttonSize, buttonSize);
    this.arena.position.set(left, arenaY);
    this.arena.layout(columnWidth, arenaHeight, buttonSize + 4, buttonSize + 4);
    this.board.position.set((width - boardSize) / 2, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(columnWidth, padHeight);
    this.intro?.position.copyFrom(this.toLocal(this.board.cellCenter(40), this.board));

    this.hurtFlash.clear().rect(-OVERSCAN, -OVERSCAN, width + OVERSCAN * 2, height + OVERSCAN * 2).fill(theme.error);
    this.modal?.layout(width, height);
  }

  /** Every frame: a turn that ran out, the turn countdown and its last-seconds ticks. */
  update(deltaMs: number): void {
    if (this.switching) return;
    if (this.connection === 'connected') this.checkDeadline();
    const { state, turnStartedAt } = this.sync.shown;
    if (state.finished || turnStartedAt === null) return;
    const total = DUEL_RULES.turnSeconds;
    const left = total - (this.backend.now() - turnStartedAt) / 1000;
    this.arena.timer.update(Math.min(1, Math.max(0, 1 - left / total)), Math.max(0, left), deltaMs / 1000);

    const mine = state.turn === this.seat;
    if (mine && left <= 5 && left > 0) {
      const whole = Math.ceil(left);
      if (whole !== this.lastTick) {
        this.lastTick = whole;
        feedback.countdownTick();
      }
    } else {
      this.lastTick = null;
    }
  }

  handleBack(): boolean {
    if (this.intro) {
      // The rematch is about to open.
    } else if (this.endShown) {
      this.leaveEnd(this.options.onMenu);
    } else if (this.modal) {
      this.closeModal();
    } else {
      this.requestLeave();
    }
    return true;
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.handleBack();
      return;
    }
    if (this.modal) return;
    if (/^[1-9]$/.test(event.key)) {
      this.handleDigit(Number(event.key));
      return;
    }
    if (event.key === 'n') {
      this.toggleNotes();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      this.board.moveSelection(...move);
    }
  }

  override destroy(options?: DestroyOptions): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.stopWatching();
    window.clearInterval(this.pollTimer);
    window.clearTimeout(this.sendTimer);
    window.clearTimeout(this.rivalTimer);
    stopEffects(this.fx);
    gsap.killTweensOf(this.hurtFlash);
    killTweens(this.board, this.pad);
    if (this.intro) killTweens(this.intro.scale);
    super.destroy(options);
  }

  /** A mobile app can miss every Realtime update while suspended. Re-read before accepting input. */
  resume(): void {
    if (!this.backend.ranked || this.destroyed) return;
    this.setConnection('connecting');
    void this.refresh();
  }

  private setConnection(state: DuelConnectionState): void {
    if (this.destroyed || !this.backend.ranked) return;
    const previous = this.connection;
    this.connection = state;
    this.connectionLabel.text = state === 'connected' ? 'Połączono' : state === 'connecting'
      ? 'Łączę ponownie…' : 'Brak połączenia · czekam na internet';
    this.connectionLabel.style.fill = state === 'connected' ? theme.textMuted : theme.gold;
    if (state === 'connected' && previous !== 'connected') {
      // The last request may already have landed. Never replay uncertain input after reconnection.
      this.rollBack(null);
      this.pump();
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing || this.destroyed || this.switching) return;
    this.refreshing = true;
    try {
      const row = await this.backend.fetchDuel(this.duelId);
      this.applyRow(row);
      this.setConnection('connected');
    } catch {
      this.setConnection('offline');
    } finally { this.refreshing = false; }
  }

  /**
   * The rival's dragon in their skin (null: not known, the default look). Not once the duel is over:
   * a dragon swapped while it falls would never finish falling.
   */
  private showRivalDragon(skin: string | null): void {
    window.clearTimeout(this.rivalTimer);
    if (this.destroyed || this.sync.confirmed.state.finished) return;
    this.arena.showRival(rivalDesign(skin));
  }

  /** The duel as the screen shows it, predictions included. */
  private get state(): DuelState {
    return this.sync.shown.state;
  }

  private handleDigit(digit: number): void {
    if (this.modal || this.switching) return;
    if (this.connection === 'connected') this.checkDeadline();
    if (this.state.finished) return;
    const cell = this.board.selected;
    if (cell === null || this.board.board[cell] !== 0) return;
    if (this.notesMode) {
      if (this.board.toggleNote(cell, digit)) feedback.select();
      return;
    }
    if (this.connection !== 'connected') {
      this.toast('Czekam na połączenie', theme.gold);
      return;
    }
    if (this.state.turn !== this.seat) {
      this.toast('Tura rywala', theme.textMuted);
      return;
    }
    const turnBefore = this.state.turn;
    const result = this.sync.play(cell, digit, this.backend.now());
    if (!result.ok) return;
    this.playEvent(result.prediction.event, result.prediction.after.state);
    this.afterChange(turnBefore);
    this.pump();
  }

/** Notes mode: digits become the player's notes in the selected cell instead of moves. */
  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    this.notesButton.setVariant(this.notesMode ? 'primary' : 'secondary');
    this.pad.setNotesMode(this.notesMode);
    feedback.select();
  }

  /** When the shown turn runs out, it passes on both screens at once; the claim follows. */
  private checkDeadline(): void {
    const turnBefore = this.state.turn;
    if (!this.predictTimeout()) return;
    this.afterChange(turnBefore);
    this.pump();
  }

  private predictTimeout(): boolean {
    const deadline = this.sync.deadline();
    const prediction = this.sync.expire(this.backend.now());
    if (!prediction) return false;
    this.playEvent(prediction.event, prediction.after.state, deadline);
    return true;
  }

  /** Sends the next prediction to the server. One at a time, so the server sees them in order. */
  private pump(): void {
    if (this.sending || this.destroyed || this.switching || this.connection !== 'connected') return;
    const prediction = this.sync.nextToSend();
    if (!prediction) return;
    const delay = prediction.sendAt - this.backend.now();
    if (delay > 0) {
      window.clearTimeout(this.sendTimer);
      this.sendTimer = window.setTimeout(() => this.pump(), delay);
      return;
    }
    this.sending = true;
    prediction.sent = true;
    const { action } = prediction;
    const request =
      action.kind === 'move' ? this.backend.move(this.duelId, action.cell, action.digit) : this.backend.claimTimeout(this.duelId);
    request
      .then((result) => this.applyRow(result.duel))
      .catch((error: unknown) => this.handleRefusal(prediction, error))
      .finally(() => {
        this.sending = false;
        this.pump();
      });
  }

  /** A request failed: see what the server has now, then try again or take the predictions back. */
  private async handleRefusal(prediction: Prediction, error: unknown): Promise<void> {
    // The action may have landed after all, or the duel moved on without it.
    await this.backend.fetchDuel(this.duelId).then((row) => {
      this.applyRow(row);
      this.setConnection('connected');
    }, () => this.setConnection('offline'));
    if (this.destroyed || this.switching || !this.sync.isPending(prediction)) return;
    const code = error instanceof OnlineError ? error.code : 'network';
    if (RETRIED.has(code) && prediction.retries < 3) {
      prediction.retries++;
      prediction.sent = false;
      prediction.sendAt = this.backend.now() + 300 * prediction.retries;
      return;
    }
    this.rollBack(prediction.action.kind === 'move' ? refusalMessage(error) : null);
  }

  /** Shows the confirmed duel again, without the predictions the server would not take. */
  private rollBack(message: string | null): void {
    const turnBefore = this.state.turn;
    if (this.sync.dropAll().length === 0) return;
    this.forgetPredictions();
    this.showState(this.state);
    if (message) this.toast(message, theme.error);
    this.afterChange(turnBefore);
  }

  private forgetPredictions(): void {
    this.epoch++;
    this.finishShownAt = null;
  }

  /**
   * Takes a version of the duel from the server. What was predicted is already on screen; anything
   * else replaces the predictions and is animated if it is the next version, or caught up with.
   */
  private applyRow(row: DuelRow): void {
    if (this.destroyed || this.switching || row.version <= this.sync.confirmed.version) return;
    this.rematch = { by: row.rematch_by, declined: row.rematch_declined, next: row.next_duel };
    if (this.sync.confirmed.state.finished) {
      // After the end only the rematch fields change; the last event is not played again.
      this.sync.confirmed = { ...this.sync.confirmed, version: row.version };
      this.updateRematch();
      return;
    }
    const turnBefore = this.state.turn;
    const received = this.sync.receive({ ...snapshotOf(row), event: row.last_event });
    this.lastEvent = row.last_event;
    if (received.kind === 'unexpected') {
      const ownDropped = received.dropped.some((p) => p.action.kind === 'move');
      if (received.dropped.length > 0) this.forgetPredictions();
      if (ownDropped) this.showState(received.before.state);
      const { turnStartedAt } = received.before;
      if (received.next && row.last_event) {
        this.playEvent(row.last_event, row.state, turnStartedAt === null ? null : turnStartedAt + TURN_MS);
      } else {
        this.showState(row.state);
      }
      if (ownDropped && !row.state.finished) {
        this.toast(row.last_event?.kind === 'timeout' ? errorMessage(new OnlineError('too-late')) : 'Ruch cofnięty', theme.error);
      }
      // A turn that ran out on screen is still out, whatever arrived in between.
      this.predictTimeout();
    }
    this.afterChange(turnBefore);
    this.pump();
  }

  /** After anything changed the shown duel: whose turn it is, and the end once the server confirms it. */
  private afterChange(turnBefore: Seat): void {
    this.updateTurn(this.state.turn !== turnBefore);
    if (this.state.finished) this.finishShownAt ??= performance.now();
    if (this.sync.confirmed.state.finished) void this.showEnd(this.lastEvent);
  }

  /** Shows `state` without animation: catching up, or taking back predictions. */
  private showState(state: DuelState): void {
    this.board.sync(state.board, 'given');
    for (let digit = 1; digit <= 9; digit++) this.pad.setDone(digit, this.board.countOf(digit) === 9);
    this.arena.hpBar(true).setHp(state.hp[this.seat]);
    this.arena.hpBar(false).setHp(state.hp[otherSeat(this.seat)]);
  }

  /**
   * Animates one event. `after` is the duel right after it (HP bars move to it); for a timeout,
   * `deadline` says which turn ran out, so the same timeout is never announced twice.
   */
  private playEvent(event: DuelEvent, after: DuelState, deadline: number | null = null): void {
    const mine = event.seat === this.seat;
    switch (event.kind) {
      case 'correct': {
        this.board.reveal(event.cell, event.digit, event.completed, mine ? 'mine' : 'rival');
        if (this.board.countOf(event.digit) === 9) this.pad.setDone(event.digit, true);
        feedback.digit(event.digit);
        if (event.completed.length > 0) feedback.unitsCompleted(event.completed.length);
        // The mover's dragon lunges as the hit flies at the other one.
        void this.arena.dragon(mine).attack();
        void this.playHit(event.cell, event.completed, !mine, event.damage, after.hp[otherSeat(event.seat)]);
        if (mine && event.extraMove && !after.finished) this.toast('Dodatkowy ruch!', theme.flash);
        break;
      }
      case 'wrong': {
        this.board.reject(event.cell, event.digit);
        feedback.mistake();
        // A mistake hurts the player who made it.
        this.hurtPlayer(mine, event.damage, false, after.hp[event.seat]);
        break;
      }
      case 'timeout':
        if (deadline === null || deadline !== this.announcedTimeout) {
          this.announcedTimeout = deadline;
          this.toast(mine ? 'Twój czas minął' : 'Czas rywala minął', theme.textMuted);
        }
        break;
      case 'forfeit':
        break;
    }
  }

  /**
   * The hitter's effect flies from the board to the dragon of the player who was hit (`targetMine`: you),
   * whose HP drops to `hp`: your effect at the rival, theirs at you. A digit that closed a 3×3 box (double
   * damage) sends a big gold shot from the box's middle.
   */
  private async playHit(cell: number, completed: Unit[], targetMine: boolean, damage: number, hp: number): Promise<void> {
    const epoch = this.epoch;
    const big = closesBox(completed);
    const box = completed.find((unit) => unit.kind === 'box');
    const origin = box ? this.board.unitCenter(box) : this.board.cellCenter(cell);
    const color = big ? theme.flash : targetMine ? this.board.colors.opponent : this.board.colors.placed;
    const to = this.fx.toLocal(this.arena.dragonPoint(targetMine), this.arena);
    await wait(0.1);
    if (this.destroyed) return;
    const from = this.fx.toLocal(origin, this.board);
    const effect = targetMine ? (this.rivalEffect ?? '') : chosenEffect(progress).id;
    await fireShot(this.fx, effect, { from, to, big, color, side: Math.random() < 0.5 ? -1 : 1 });
    if (this.destroyed) return;
    // Predictions taken back meanwhile: show the HP as it is now.
    this.hurtPlayer(targetMine, damage, big, epoch === this.epoch ? hp : null);
  }

  /** HP bar (to `hp`, or the shown HP), dragon flinch, damage number and sound for a hit on one player. */
  private hurtPlayer(mine: boolean, damage: number, big: boolean, hp: number | null): void {
    const seat = mine ? this.seat : otherSeat(this.seat);
    this.arena.hpBar(mine).setHp(hp ?? this.state.hp[seat]);
    this.arena.dragon(mine).hurt(big ? 18 : 8);
    const at = this.fx.toLocal(this.arena.dragonPoint(mine), this.arena);
    floatText(this.fx, `-${damage}`, { x: at.x, y: at.y - 30 }, { color: mine ? theme.error : theme.flash, fontSize: big ? 30 : 22 });
    if (big) floatText(this.fx, 'Kwadrat ×2!', { x: at.x, y: at.y - 70 }, { color: theme.combo, fontSize: 24 });
    if (mine) {
      feedback.playerHit();
      shake(this, big ? 8 : 4, 0.3);
      gsap.fromTo(this.hurtFlash, { alpha: 0.25 }, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    } else {
      feedback.enemyHit(big);
    }
  }

  private updateTurn(turnChanged: boolean): void {
    const mine = this.state.turn === this.seat;
    this.arena.showTurn(mine, this.state.movesLeft, this.state.finished);
    this.pad.alpha = mine && !this.state.finished ? 1 : 0.45;
    const startedAt = this.sync.shown.turnStartedAt;
    if (turnChanged && mine && !this.state.finished && startedAt !== this.announcedTurn) {
      this.announcedTurn = startedAt;
      feedback.yourTurn();
      this.toast('Twoja tura!', theme.flash);
    }
  }

  /** A short message floating up from the middle of the board. */
  private toast(text: string, color: number): void {
    const at = this.fx.toLocal(this.board.cellCenter(40), this.board);
    floatText(this.fx, text, at, { color, fontSize: 24 });
  }

  private requestLeave(): void {
    if (this.modal || this.intro) return;
    if (this.sync.confirmed.state.finished) {
      this.leaveEnd(this.options.onMenu);
      return;
    }
    this.openModal(
      new Modal('Poddać pojedynek?', 'Rywal wygra walkowerem.', [
        { text: 'Graj dalej', variant: 'primary', onTap: () => this.closeModal() },
        {
          text: 'Poddaj się',
          onTap: () => {
            this.closeModal();
            // The rival learns it from the server; nothing here waits for that.
            const leaving = this.backend.leave(this.duelId);
            if (this.backend.ranked) {
              void Promise.resolve(leaving).then(async (row) => {
                if (!row || (await supabase.auth.getSession()).data.session?.user.id !== this.me.id) return;
                if (row.state.finished) {
                  recordDuelOnce(this.me.id, this.duelId, row.state.winner === this.seat);
                  forgetDuel(this.duelId);
                } else if (row.status === 'cancelled') forgetDuel(this.duelId);
              }).catch(() => {});
              // An unreachable forfeit keeps its pointer: on restart the server decides whether to
              // resume the duel or show its result. A local button press is not proof of a defeat.
            }
            this.options.onMenu();
          },
        },
      ]),
    );
  }

  private openModal(modal: Modal): void {
    this.closeModal();
    this.modal = modal;
    this.addChild(modal);
    modal.layout(this.screenWidth, this.screenHeight);
    modal.show();
  }

  private closeModal(): void {
    this.modal?.destroy({ children: true });
    this.modal = null;
  }

  private async showEnd(event: DuelEvent | null): Promise<void> {
    if (this.endShown) return;
    this.endShown = true;
    this.closeModal();

    const winner = this.state.winner;
    const won = winner === this.seat;
    const draw = winner === null;
    // Persist before waiting for a hit/death animation, including on a restored finished duel.
    if (this.backend.ranked) this.reward = recordDuelOnce(this.me.id, this.duelId, won);
    // Let the last hit land (shown when it was played, maybe before the server confirmed it),
    // then the loser's dragon falls.
    const since = (performance.now() - (this.finishShownAt ?? performance.now())) / 1000;
    await wait(Math.max(0, 1 - since));
    if (this.destroyed) return;
    if (!draw) {
      feedback.dragonFalls();
      await this.arena.dragon(!won).die();
      if (this.destroyed) return;
    }

    this.endMessage = `Twoje HP: ${this.state.hp[this.seat]} · ${this.rivalName}: ${this.state.hp[otherSeat(this.seat)]}`;
    this.rivalLeft = event?.kind === 'forfeit' && event.seat !== this.seat;
    if (event?.kind === 'forfeit') {
      this.endMessage = event.seat === this.seat ? 'Poddałeś pojedynek.' : `${this.rivalName} opuścił pojedynek.`;
    }
    if (this.backend.ranked) {
      if (this.reward) this.endMessage = [this.endMessage, ...rewardLines(this.reward, progress.stars)].join('\n');
    } else {
      this.endMessage += '\nTrening z botem nie daje gwiazdek.';
    }
    if (won) {
      feedback.victory();
    } else {
      feedback.defeat();
    }
    this.endTitle = won ? 'Wygrana!' : draw ? 'Remis' : 'Porażka';
    this.openEndDialog();
  }

  private openEndDialog(): void {
    this.openModal(
      new Modal(this.endTitle, this.endMessage, [
        { text: 'Rewanż', variant: 'primary', onTap: () => this.requestRematch() },
        { text: 'Nowy pojedynek', onTap: () => this.leaveEnd(this.options.onLobby) },
        { text: 'Menu', onTap: () => this.leaveEnd(this.options.onMenu) },
      ], this.sync.confirmed.state.winner === this.seat ? theme.gold : theme.text),
    );
    this.updateRematch();
  }

  /** Shows the rematch situation in the end dialog, or opens the rematch once both asked. */
  private updateRematch(): void {
    const { by, declined, next } = this.rematch;
    if (next) {
      this.playRematchIntro();
      void this.openRematch(next);
      return;
    }
    if (!this.endShown || !this.modal) return;
    const button = this.modal.button(0);
    if (declined) {
      button.setText('Rewanż');
      button.setEnabled(false);
      const gone = this.rivalLeft ? '' : `\n${this.rivalName} wyszedł z pojedynku.`;
      this.modal.setMessage(this.endMessage + gone);
    } else if (this.rematchAsked || by === this.seat) {
      button.setText('Czekam na rywala…');
      button.setEnabled(false);
      this.modal.setMessage(`${this.endMessage}\nWysłano prośbę o rewanż.`);
    } else if (by !== null) {
      button.setText('Przyjmij rewanż');
      button.setEnabled(true);
      this.modal.setMessage(`${this.endMessage}\n${this.rivalName} chce rewanżu!`);
      feedback.yourTurn();
    }
  }

  private requestRematch(): void {
    if (this.rematchAsked || this.switching) return;
    this.rematchAsked = true;
    // The rival already asked, so this answer starts the rematch: show it now, the server only deals the board.
    const accepting = this.rematch.by !== null && this.rematch.by !== this.seat;
    if (accepting) {
      this.playRematchIntro();
    } else {
      this.updateRematch();
    }
    this.backend
      .rematch(this.duelId)
      .then((result) => {
        if (result.duel && result.seat !== undefined) {
          this.startRematch(result.duel, result.seat);
        } else if (!this.switching) {
          this.cancelRematchIntro();
        }
      })
      .catch((error) => {
        if (this.destroyed || this.switching) return;
        this.rematchAsked = false;
        if (error instanceof OnlineError && error.code === 'rival-left') this.rematch.declined = true;
        if (this.intro) {
          this.cancelRematchIntro();
        } else {
          this.updateRematch();
        }
        if (!this.rematch.declined) this.toast(errorMessage(error), theme.error);
      });
  }

  /** The rival accepted (we learnt it from the old duel's row): load the new duel and switch to it. */
  private async openRematch(nextId: string): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    try {
      this.startRematch(await this.backend.fetchDuel(nextId), this.seat);
    } catch {
      if (this.destroyed) return;
      this.switching = false;
      this.cancelRematchIntro();
      this.toast(errorMessage(null), theme.error);
    }
  }

  private startRematch(duel: DuelRow, seat: Seat): void {
    if (this.destroyed) return;
    this.switching = true;
    this.options.onRematch(duel, seat);
  }

  /** The end dialog gives way to "Rewanż!" over a fading board until the new duel opens. */
  private playRematchIntro(): void {
    if (this.intro) return;
    this.closeModal();
    feedback.yourTurn();
    const intro = new Container();
    const title = new Text({
      text: 'Rewanż!',
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '600',
        fontSize: 50,
        fill: theme.gold,
      },
    });
    const subtitle = new Text({
      text: 'Nowa plansza…',
      style: {
        fontFamily: theme.fontFamily,
        fontWeight: '700',
        fontSize: 18,
        fill: theme.text,
      },
    });
    title.anchor.set(0.5, 1);
    subtitle.anchor.set(0.5, 0);
    subtitle.y = 8;
    intro.addChild(title, subtitle);
    intro.position.copyFrom(this.toLocal(this.board.cellCenter(40), this.board));
    this.intro = intro;
    this.addChild(intro);
    gsap.fromTo(intro.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
    gsap.to([this.board, this.pad], { alpha: 0.2, duration: 0.3 });
  }

  /** The rematch did not start after all: back to the end dialog. */
  private cancelRematchIntro(): void {
    if (!this.intro) return;
    killTweens(this.intro.scale, this.board, this.pad);
    this.intro.destroy({ children: true });
    this.intro = null;
    this.board.alpha = 1;
    this.updateTurn(false);
    this.openEndDialog();
  }

  /** Leaving the end screen tells the rival not to wait for a rematch. */
  private leaveEnd(go: () => void): void {
    if (this.backend.ranked) forgetDuel(this.duelId);
    if (!this.switching && !this.rematch.declined && !this.rematch.next) {
      void this.backend.declineRematch(this.duelId).catch(() => {});
    }
    go();
  }
}
