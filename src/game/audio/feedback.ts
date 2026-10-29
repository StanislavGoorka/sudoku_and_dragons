import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { loadSettings, saveSettings, type Settings } from '../settings.ts';
import { Synth } from './Synth.ts';

type Buzz = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/**
 * Sound and vibration for game events, in one place: screens say what happened ("a combo",
 * "the player got hit") and this decides what it sounds and feels like, honouring the settings.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is created by `unlock()`,
 * which main.ts calls on every tap. Vibration only runs in the native app; desktop browsers
 * ignore it and complain.
 */
class Feedback {
  readonly settings: Settings = loadSettings();
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private readonly native = Capacitor.isNativePlatform();

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.synth = new Synth(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** The app went to the background: stop the audio thread to save battery. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  setSound(on: boolean): void {
    this.settings.sound = on;
    saveSettings(this.settings);
  }

  setHaptics(on: boolean): void {
    this.settings.haptics = on;
    saveSettings(this.settings);
    if (on) this.buzz('medium');
  }

  tap(): void {
    this.play((s) => s.tap());
  }

  select(): void {
    this.play((s) => s.select());
  }

  digit(digit: number): void {
    this.play((s) => s.digit(digit));
    this.buzz('light');
  }

  /** `count` rows, columns or boxes completed by one digit. */
  unitsCompleted(count: number): void {
    this.play((s) => s.unit(count));
    this.buzz(count >= 2 ? 'heavy' : 'medium');
  }

  enemyHit(big: boolean): void {
    this.play((s) => (big ? s.hitBig() : s.hitSmall()));
  }

  mistake(): void {
    this.play((s) => s.mistake());
    this.buzz('error');
  }

  dragonLunge(): void {
    this.play((s) => s.roar());
  }

  fireball(): void {
    this.play((s) => s.fireball());
  }

  playerHit(): void {
    this.play((s) => s.playerHurt());
    this.buzz('heavy');
  }

  /** A duel turn passes to you. */
  yourTurn(): void {
    this.play((s) => s.yourTurn());
    this.buzz('light');
  }

  /** One of the last seconds before the dragon's timed attack. */
  countdownTick(): void {
    this.play((s) => s.tick());
  }

  /** Stars spent in the shop. */
  purchase(): void {
    this.play((s) => s.purchase());
    this.buzz('success');
  }

  dragonFalls(): void {
    this.play((s) => s.dragonFall());
    this.buzz('heavy');
  }

  victory(): void {
    this.play((s) => s.victory());
    this.buzz('success');
  }

  defeat(): void {
    this.play((s) => s.defeat());
    this.buzz('error');
  }

  private play(sound: (synth: Synth) => void): void {
    if (!this.settings.sound || !this.synth || this.ctx?.state !== 'running') return;
    sound(this.synth);
  }

  private buzz(kind: Buzz): void {
    if (!this.settings.haptics || !this.native) return;
    const done = (promise: Promise<void>) => promise.catch(() => {});
    switch (kind) {
      case 'light':
        void done(Haptics.impact({ style: ImpactStyle.Light }));
        break;
      case 'medium':
        void done(Haptics.impact({ style: ImpactStyle.Medium }));
        break;
      case 'heavy':
        void done(Haptics.impact({ style: ImpactStyle.Heavy }));
        break;
      case 'success':
        void done(Haptics.notification({ type: NotificationType.Success }));
        break;
      case 'error':
        void done(Haptics.notification({ type: NotificationType.Error }));
        break;
    }
  }
}

export const feedback = new Feedback();
