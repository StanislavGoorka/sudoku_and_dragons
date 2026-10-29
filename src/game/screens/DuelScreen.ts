import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { DUEL_RULES, otherSeat, solve, type DuelEvent, type DuelState, type Seat, type Unit } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { DIFFICULTY_INFO } from '../difficulty.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import { killTweens } from '../fx/tweens.ts';
import { DuelSync, type Prediction, type Snapshot } from '../net/duelSync.ts';
import {
  errorMessage,
  fetchDuel,
  fetchNickname,
  leaveDuel,
  online,
  OnlineError,
  serverNow,
  watchDuel,
  type DuelRow,
  type Me,
} from '../net/online.ts';
import { OVERSCAN } from '../safeArea.ts';
import { theme } from '../theme.ts';
import { BoardView } from '../ui/BoardView.ts';
import { Button } from '../ui/Button.ts';
import { DuelArena } from '../ui/DuelArena.ts';
import { Modal } from '../ui/Modal.ts';
import { NumberPad } from '../ui/NumberPad.ts';

export interface DuelScreenOptions {
  /** Back to the online lobby for another duel. */
  onLobby: () => void;
  onMenu: () => void;
  /** Both players asked for a rematch: open the new duel. */
  onRematch: (duel: DuelRow, seat: Seat) => void;
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
  private readonly duelId: string;
  private readonly me: Me;
  private readonly seat: Seat;
  private readonly options: DuelScreenOptions;
  private readonly difficultyName: string;
  private readonly sync: DuelSync;
  /** The event behind the last confirmed version. */
  private lastEvent: DuelEvent | null;
  private rivalName = 'Rywal';

  private readonly title = new Text({
    text: 'Pojedynek',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 20, fill: theme.text },
  });
  private readonly status = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontSize: 14, fill: theme.textMuted },
  });
  private readonly arena: DuelArena;
  private readonly board: BoardView;
  private readonly pad: NumberPad;
  private readonly fx = new Container();
  private readonly hurtFlash = new Graphics();
  private readonly menuButton: Button;
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
  private screenWidth = 0;
  private screenHeight = 0;

  constructor(row: DuelRow, me: Me, seat: Seat, options: DuelScreenOptions) {
    super();
    this.duelId = row.id;
    this.me = me;
    this.seat = seat;
    this.options = options;
    this.difficultyName = DIFFICULTY_INFO[row.difficulty].name;
    // The board has one solution, so the client finds it too; it only predicts with it.
    const solution = solve(row.state.board);
    if (!solution) throw new Error(`Duel ${row.id} has an unsolvable board`);
    this.sync = new DuelSync(snapshotOf(row), seat, solution);
    this.lastEvent = row.last_event;
    this.announcedTurn = this.sync.confirmed.turnStartedAt;
    this.rematch = { by: row.rematch_by, declined: row.rematch_declined, next: row.next_duel };

    this.menuButton = new Button({ text: '‹ Menu', onTap: () => this.requestLeave() });
    this.title.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);
    this.arena = new DuelArena(me.nickname, this.rivalName, DUEL_RULES.maxHp);
    this.arena.hpBar(true).setHp(this.state.hp[seat]);
    this.arena.hpBar(false).setHp(this.state.hp[otherSeat(seat)]);
    this.board = new BoardView(row.state.board);
    this.pad = new NumberPad((digit) => this.handleDigit(digit));
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;
    this.addChild(this.arena, this.title, this.status, this.menuButton, this.board, this.pad, this.hurtFlash, this.fx);

    this.stopWatching = watchDuel(this.duelId, (next) => this.applyRow(next));
    // A safety net for missed live updates: during the duel, and after it while a rematch is still possible.
    this.pollTimer = window.setInterval(() => {
      if (this.sending || this.switching || this.rematch.declined) return;
      void fetchDuel(this.duelId).then((next) => this.applyRow(next), () => {});
    }, 4000);
    const rivalId = seat === 0 ? row.player1 : row.player0;
    if (rivalId) {
      void fetchNickname(rivalId).then((name) => {
        if (this.destroyed) return;
        this.rivalName = name;
        this.arena.setRivalName(name);
        this.updateStatus();
      });
    }
    this.updateStatus();
    this.updateTurn(false);
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;

    const margin = 16;
    const gap = 12;
    const headerHeight = 52;
    const minArenaHeight = 150;

    let boardSize = Math.min(width - margin * 2, 560);
    const padHeight = Math.round(Math.min(72, Math.max(48, (boardSize / 9) * 1.3)));
    const room = height - margin * 2 - headerHeight - minArenaHeight - padHeight - gap * 2;
    boardSize = Math.max(180, Math.min(boardSize, room));

    const left = (width - boardSize) / 2;
    const padY = height - margin - padHeight;
    const boardY = padY - gap - boardSize;
    const arenaY = margin + headerHeight;

    this.title.position.set(width / 2, margin);
    this.status.position.set(width / 2, margin + 28);
    this.menuButton.position.set(left, margin + 2);
    this.menuButton.layout(64, 30);
    this.arena.position.set(left, arenaY);
    this.arena.layout(boardSize, Math.max(0, boardY - gap - arenaY));
    this.board.position.set(left, boardY);
    this.board.layout(boardSize);
    this.pad.position.set(left, padY);
    this.pad.layout(boardSize, padHeight);
    this.intro?.position.copyFrom(this.toLocal(this.board.cellCenter(40), this.board));

    this.hurtFlash.clear().rect(-OVERSCAN, -OVERSCAN, width + OVERSCAN * 2, height + OVERSCAN * 2).fill(theme.error);
    this.modal?.layout(width, height);
  }

  /** Every frame: a turn that ran out, the turn countdown and its last-seconds ticks. */
  update(deltaMs: number): void {
    if (this.switching) return;
    this.checkDeadline();
    const { state, turnStartedAt } = this.sync.shown;
    if (state.finished || turnStartedAt === null) return;
    const total = DUEL_RULES.turnSeconds;
    const left = total - (serverNow() - turnStartedAt) / 1000;
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
    this.stopWatching();
    window.clearInterval(this.pollTimer);
    window.clearTimeout(this.sendTimer);
    stopEffects(this.fx);
    gsap.killTweensOf(this.hurtFlash);
    killTweens(this.board, this.pad);
    if (this.intro) killTweens(this.intro.scale);
    super.destroy(options);
  }

  /** The duel as the screen shows it, predictions included. */
  private get state(): DuelState {
    return this.sync.shown.state;
  }

  private handleDigit(digit: number): void {
    if (this.modal || this.switching) return;
    this.checkDeadline();
    if (this.state.finished) return;
    const cell = this.board.selected;
    if (cell === null || this.board.board[cell] !== 0) return;
    if (this.state.turn !== this.seat) {
      this.toast('Tura rywala', theme.textMuted);
      return;
    }
    const turnBefore = this.state.turn;
    const result = this.sync.play(cell, digit, serverNow());
    if (!result.ok) return;
    this.playEvent(result.prediction.event, result.prediction.after.state);
    this.afterChange(turnBefore);
    this.pump();
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
    const prediction = this.sync.expire(serverNow());
    if (!prediction) return false;
    this.playEvent(prediction.event, prediction.after.state, deadline);
    return true;
  }

  /** Sends the next prediction to the server. One at a time, so the server sees them in order. */
  private pump(): void {
    if (this.sending || this.destroyed || this.switching) return;
    const prediction = this.sync.nextToSend();
    if (!prediction) return;
    const delay = prediction.sendAt - serverNow();
    if (delay > 0) {
      window.clearTimeout(this.sendTimer);
      this.sendTimer = window.setTimeout(() => this.pump(), delay);
      return;
    }
    this.sending = true;
    prediction.sent = true;
    const { action } = prediction;
    const request =
      action.kind === 'move' ? online.move(this.duelId, action.cell, action.digit) : online.claimTimeout(this.duelId);
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
    await fetchDuel(this.duelId).then((row) => this.applyRow(row), () => {});
    if (this.destroyed || this.switching || !this.sync.isPending(prediction)) return;
    const code = error instanceof OnlineError ? error.code : 'network';
    if (RETRIED.has(code) && prediction.retries < 3) {
      prediction.retries++;
      prediction.sent = false;
      prediction.sendAt = serverNow() + 300 * prediction.retries;
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
    this.board.sync(state.board, theme.text);
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
        this.board.reveal(event.cell, event.digit, event.completed, mine ? theme.placed : theme.opponent);
        if (this.board.countOf(event.digit) === 9) this.pad.setDone(event.digit, true);
        feedback.digit(event.digit);
        if (event.completed.length > 0) feedback.unitsCompleted(event.completed.length);
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

  /** Orbs fly from the board to the dragon of the player who was hit (`targetMine`: you), whose HP drops to `hp`. */
  private async playHit(cell: number, completed: Unit[], targetMine: boolean, damage: number, hp: number): Promise<void> {
    const epoch = this.epoch;
    const big = completed.length > 0;
    const origins = big ? completed.map((unit) => this.board.unitCenter(unit)) : [this.board.cellCenter(cell)];
    const color = big ? theme.flash : targetMine ? theme.opponent : theme.placed;
    const to = this.fx.toLocal(this.arena.dragonPoint(targetMine), this.arena);
    let landed = false;
    await Promise.all(
      origins.map(async (origin, i) => {
        await wait(0.1 + i * 0.12);
        if (this.destroyed) return;
        const from = this.fx.toLocal(origin, this.board);
        await launchOrb(this.fx, from, to, {
          color,
          radius: big ? 9 : 5,
          duration: big ? 0.5 : 0.35,
          arc: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 50),
        });
        if (this.destroyed) return;
        burst(this.fx, to, color, big ? 14 : 6);
        if (landed) return;
        landed = true;
        // Predictions taken back meanwhile: show the HP as it is now.
        this.hurtPlayer(targetMine, damage, big, epoch === this.epoch ? hp : null);
      }),
    );
  }

  /** HP bar (to `hp`, or the shown HP), dragon flinch, damage number and sound for a hit on one player. */
  private hurtPlayer(mine: boolean, damage: number, big: boolean, hp: number | null): void {
    const seat = mine ? this.seat : otherSeat(this.seat);
    this.arena.hpBar(mine).setHp(hp ?? this.state.hp[seat]);
    this.arena.dragon(mine).hurt(big ? 18 : 8);
    const at = this.fx.toLocal(this.arena.dragonPoint(mine), this.arena);
    floatText(this.fx, `-${damage}`, { x: at.x, y: at.y - 30 }, { color: mine ? theme.error : theme.flash, fontSize: big ? 30 : 22 });
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

  private updateStatus(): void {
    this.status.text = `${this.difficultyName} · ${this.me.nickname} vs ${this.rivalName}`;
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
            leaveDuel(this.duelId);
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
      ]),
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
    online
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
      this.startRematch(await fetchDuel(nextId), this.seat);
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
      style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 46, fill: theme.flash },
    });
    const subtitle = new Text({
      text: 'Nowa plansza…',
      style: { fontFamily: theme.fontFamily, fontSize: 16, fill: theme.textMuted },
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
    if (!this.switching && !this.rematch.declined && !this.rematch.next) {
      void online.declineRematch(this.duelId).catch(() => {});
    }
    go();
  }
}
