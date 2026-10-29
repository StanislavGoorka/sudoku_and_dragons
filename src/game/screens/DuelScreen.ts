import gsap from 'gsap';
import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { DUEL_RULES, type DuelEvent, type DuelState, type Seat, type Unit } from '../../core/index.ts';
import { feedback } from '../audio/feedback.ts';
import { DIFFICULTY_INFO } from '../difficulty.ts';
import { burst, floatText, launchOrb, shake, stopEffects, wait } from '../fx/effects.ts';
import {
  errorMessage,
  fetchDuel,
  fetchNickname,
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

/**
 * An online duel on a shared board. The server judges every move; this screen sends the player's
 * digits and plays out each new version of the duel as it arrives (own moves and the rival's alike).
 */
export class DuelScreen extends Container {
  private readonly duelId: string;
  private readonly me: Me;
  private readonly seat: Seat;
  private readonly options: DuelScreenOptions;
  private readonly difficultyName: string;
  private state: DuelState;
  private version: number;
  private turnStartedAt: number | null;
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
  /** The end dialog's message before any rematch news is added. */
  private endMessage = '';
  /** The rival gave up, so the end message already says they left. */
  private rivalLeft = false;

  /** A move is on its way to the server; further input waits for the answer. */
  private pending = false;
  private endShown = false;
  /** The duel version whose turn we already reported as timed out. */
  private timeoutClaimedAt = -1;
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
    this.state = row.state;
    this.version = row.version;
    this.turnStartedAt = row.turn_started_at ? Date.parse(row.turn_started_at) : null;
    this.rematch = { by: row.rematch_by, declined: row.rematch_declined, next: row.next_duel };

    this.menuButton = new Button({ text: '‹ Menu', onTap: () => this.requestLeave() });
    this.title.anchor.set(0.5, 0);
    this.status.anchor.set(0.5, 0);
    this.arena = new DuelArena(me.nickname, this.rivalName, DUEL_RULES.maxHp);
    this.arena.hpBar(true).setHp(this.state.hp[seat]);
    this.arena.hpBar(false).setHp(this.state.hp[1 - seat]);
    this.board = new BoardView(row.state.board);
    this.pad = new NumberPad((digit) => this.handleDigit(digit));
    this.fx.eventMode = 'none';
    this.hurtFlash.eventMode = 'none';
    this.hurtFlash.alpha = 0;
    this.addChild(this.arena, this.title, this.status, this.menuButton, this.board, this.pad, this.hurtFlash, this.fx);

    this.stopWatching = watchDuel(this.duelId, (next) => this.applyRow(next));
    // A safety net for missed live updates: during the duel, and after it while a rematch is still possible.
    this.pollTimer = window.setInterval(() => {
      if (this.pending || this.switching || this.rematch.declined) return;
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

    this.hurtFlash.clear().rect(-OVERSCAN, -OVERSCAN, width + OVERSCAN * 2, height + OVERSCAN * 2).fill(theme.error);
    this.modal?.layout(width, height);
  }

  /** Every frame: the turn countdown, its last-seconds ticks, and reporting a turn that ran out. */
  update(deltaMs: number): void {
    if (this.state.finished || this.turnStartedAt === null) return;
    const total = DUEL_RULES.turnSeconds;
    const left = total - (serverNow() - this.turnStartedAt) / 1000;
    this.arena.timer.update(Math.min(1, Math.max(0, 1 - left / total)), Math.max(0, left), deltaMs / 1000);

    const mine = this.state.turn === this.seat;
    if (mine && left <= 5 && left > 0) {
      const whole = Math.ceil(left);
      if (whole !== this.lastTick) {
        this.lastTick = whole;
        feedback.countdownTick();
      }
    } else {
      this.lastTick = null;
    }

    // Either player may report it; the server checks the deadline itself.
    if (left < -1 && this.timeoutClaimedAt !== this.version) {
      this.timeoutClaimedAt = this.version;
      void online.claimTimeout(this.duelId).then((r) => this.applyRow(r.duel), () => {});
    }
  }

  handleBack(): boolean {
    if (this.endShown) {
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
    stopEffects(this.fx);
    gsap.killTweensOf(this.hurtFlash);
    super.destroy(options);
  }

  private handleDigit(digit: number): void {
    if (this.modal || this.state.finished || this.pending) return;
    const cell = this.board.selected;
    if (cell === null || this.board.board[cell] !== 0) return;
    if (this.state.turn !== this.seat) {
      this.toast('Tura rywala', theme.textMuted);
      return;
    }
    this.pending = true;
    online
      .move(this.duelId, cell, digit)
      .then((result) => this.applyRow(result.duel))
      .catch(async (error) => {
        // Usually the state moved on (turn passed, cell taken): catch up and say why.
        if (error instanceof OnlineError && error.code !== 'network') {
          await fetchDuel(this.duelId).then((row) => this.applyRow(row), () => {});
        }
        this.toast(errorMessage(error), theme.error);
      })
      .finally(() => {
        this.pending = false;
      });
  }

  /** Takes a newer version of the duel: animates it if it is the next one, otherwise just catches up. */
  private applyRow(row: DuelRow): void {
    if (this.destroyed || this.switching || row.version <= this.version) return;
    const wasFinished = this.state.finished;
    this.rematch = { by: row.rematch_by, declined: row.rematch_declined, next: row.next_duel };
    if (wasFinished) {
      // After the end only the rematch fields change; the last event is not played again.
      this.version = row.version;
      this.updateRematch();
      return;
    }
    const next = row.version === this.version + 1;
    const turnBefore = this.state.turn;
    this.state = row.state;
    this.version = row.version;
    this.turnStartedAt = row.turn_started_at ? Date.parse(row.turn_started_at) : null;

    if (next && row.last_event) {
      this.playEvent(row.last_event);
    } else {
      this.board.sync(row.state.board, theme.text);
      this.arena.hpBar(true).setHp(row.state.hp[this.seat]);
      this.arena.hpBar(false).setHp(row.state.hp[1 - this.seat]);
    }
    this.updateTurn(this.state.turn !== turnBefore);
    if (row.state.finished) void this.showEnd(row.last_event);
  }

  private playEvent(event: DuelEvent): void {
    const mine = event.seat === this.seat;
    switch (event.kind) {
      case 'correct': {
        this.board.reveal(event.cell, event.digit, event.completed, mine ? theme.placed : theme.opponent);
        if (this.board.countOf(event.digit) === 9) this.pad.setDone(event.digit, true);
        feedback.digit(event.digit);
        if (event.completed.length > 0) feedback.unitsCompleted(event.completed.length);
        void this.playHit(event.cell, event.completed, !mine, event.damage);
        if (mine && event.extraMove && !this.state.finished) this.toast('Dodatkowy ruch!', theme.flash);
        break;
      }
      case 'wrong': {
        this.board.reject(event.cell, event.digit);
        feedback.mistake();
        // A mistake hurts the player who made it.
        this.hurtPlayer(mine, event.damage);
        break;
      }
      case 'timeout':
        this.toast(mine ? 'Twój czas minął' : 'Czas rywala minął', theme.textMuted);
        break;
      case 'forfeit':
        break;
    }
  }

  /** Orbs fly from the board to the dragon of the player who was hit (`targetMine`: you). */
  private async playHit(cell: number, completed: Unit[], targetMine: boolean, damage: number): Promise<void> {
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
        this.hurtPlayer(targetMine, damage, big);
      }),
    );
  }

  /** HP bar, dragon flinch, damage number and sound for a hit on one player. */
  private hurtPlayer(mine: boolean, damage: number, big = false): void {
    const seat = mine ? this.seat : ((1 - this.seat) as Seat);
    this.arena.hpBar(mine).setHp(this.state.hp[seat]);
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
    if (turnChanged && mine && !this.state.finished) {
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
    if (this.modal) return;
    if (this.state.finished) {
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
            void online.leave(this.duelId).catch(() => {}).finally(() => this.options.onMenu());
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
    // Let the last hit land, then the loser's dragon falls.
    await wait(1);
    if (this.destroyed) return;
    if (!draw) {
      feedback.dragonFalls();
      await this.arena.dragon(!won).die();
      if (this.destroyed) return;
    }

    this.endMessage = `Twoje HP: ${this.state.hp[this.seat]} · ${this.rivalName}: ${this.state.hp[1 - this.seat]}`;
    this.rivalLeft = event?.kind === 'forfeit' && event.seat !== this.seat;
    if (event?.kind === 'forfeit') {
      this.endMessage = event.seat === this.seat ? 'Poddałeś pojedynek.' : `${this.rivalName} opuścił pojedynek.`;
    }
    if (won) {
      feedback.victory();
    } else {
      feedback.defeat();
    }
    this.openModal(
      new Modal(won ? 'Wygrana!' : draw ? 'Remis' : 'Porażka', this.endMessage, [
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
    this.updateRematch();
    online
      .rematch(this.duelId)
      .then((result) => {
        if (result.duel && result.seat !== undefined) this.startRematch(result.duel, result.seat);
      })
      .catch((error) => {
        this.rematchAsked = false;
        if (error instanceof OnlineError && error.code === 'rival-left') {
          this.rematch.declined = true;
        } else {
          this.toast(errorMessage(error), theme.error);
        }
        this.updateRematch();
      });
  }

  /** The rival accepted (we learnt it from the old duel's row): load the new duel and switch to it. */
  private async openRematch(nextId: string): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    try {
      this.startRematch(await fetchDuel(nextId), this.seat);
    } catch {
      this.switching = false;
      this.toast(errorMessage(null), theme.error);
    }
  }

  private startRematch(duel: DuelRow, seat: Seat): void {
    if (this.destroyed) return;
    this.switching = true;
    this.options.onRematch(duel, seat);
  }

  /** Leaving the end screen tells the rival not to wait for a rematch. */
  private leaveEnd(go: () => void): void {
    if (!this.switching && !this.rematch.declined && !this.rematch.next) {
      void online.declineRematch(this.duelId).catch(() => {});
    }
    go();
  }
}
