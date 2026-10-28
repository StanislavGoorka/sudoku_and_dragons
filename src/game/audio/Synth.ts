/** MIDI note number to frequency in Hz. */
function hz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** C major pentatonic from C5: any order of digits sounds pleasant. Index = digit - 1. */
const DIGIT_NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91];

interface ToneOptions {
  wave?: OscillatorType;
  /** Start frequency in Hz; `to` glides to another one over the duration. */
  freq: number;
  to?: number;
  /** Seconds from now. */
  at?: number;
  duration: number;
  volume: number;
  attack?: number;
}

interface NoiseOptions {
  filter: BiquadFilterType;
  /** Filter frequency in Hz; `to` sweeps it over the duration. */
  freq: number;
  to?: number;
  q?: number;
  at?: number;
  duration: number;
  volume: number;
  attack?: number;
}

/**
 * Every sound effect of the game, synthesised with Web Audio: no sample files to license or load.
 * Works on any BaseAudioContext, so an OfflineAudioContext can render the sounds for checking.
 */
export class Synth {
  private readonly ctx: BaseAudioContext;
  private readonly out: GainNode;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    // Soft clipping (tanh) so overlapping effects (a combo landing during a fireball) never clip:
    // nearly linear for quiet sounds, rounding off only loud peaks. Not a DynamicsCompressor:
    // Chrome's one turned short quiet sounds down by ~10 dB even below its threshold.
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 512 - 1) * 1.2) / Math.tanh(1.2);
    const clipper = ctx.createWaveShaper();
    clipper.curve = curve;
    clipper.oversample = '2x';
    this.out.connect(clipper).connect(destination);
  }

  /** UI button. */
  tap(): void {
    this.tone({ wave: 'triangle', freq: 700, to: 480, duration: 0.06, volume: 0.15 });
  }

  /** Selecting a board cell: barely there. */
  select(): void {
    this.tone({ freq: 1100, duration: 0.035, volume: 0.05 });
  }

  /** A correct digit: a plucked note, one pitch per digit. */
  digit(digit: number): void {
    const freq = hz(DIGIT_NOTES[Math.min(9, Math.max(1, digit)) - 1]);
    this.tone({ wave: 'triangle', freq, duration: 0.28, volume: 0.3 });
    this.tone({ freq: freq * 2, duration: 0.12, volume: 0.08 });
  }

  /** Rows, columns or boxes completed by one digit: a chime, longer and brighter for a combo. */
  unit(count: number): void {
    const notes = count >= 2 ? [84, 88, 91, 96, 100, 103].slice(0, 3 + count) : [88, 91, 96];
    const step = count >= 2 ? 0.055 : 0.07;
    notes.forEach((note, i) => {
      this.tone({ freq: hz(note), at: i * step, duration: 0.6, volume: 0.22 });
      this.tone({ wave: 'triangle', freq: hz(note) * 2, at: i * step, duration: 0.2, volume: 0.05 });
    });
    if (count >= 2) {
      this.noise({ filter: 'highpass', freq: 5000, at: 0.05, duration: 0.5, volume: 0.06, attack: 0.1 });
    }
  }

  /** A small orb lands on the dragon. */
  hitSmall(): void {
    this.tone({ freq: 320, to: 140, duration: 0.09, volume: 0.18 });
    this.noise({ filter: 'highpass', freq: 3000, duration: 0.05, volume: 0.06 });
  }

  /** A big orb (completed unit) lands on the dragon. */
  hitBig(): void {
    this.tone({ freq: 150, to: 45, duration: 0.35, volume: 0.45 });
    this.noise({ filter: 'lowpass', freq: 2600, to: 200, duration: 0.35, volume: 0.45 });
  }

  /** A wrong digit: a short descending "nope". */
  mistake(): void {
    this.tone({ wave: 'square', freq: 220, duration: 0.11, volume: 0.13 });
    this.tone({ wave: 'square', freq: 165, at: 0.1, duration: 0.16, volume: 0.13 });
  }

  /** The dragon lunges. */
  roar(): void {
    this.noise({ filter: 'bandpass', freq: 220, to: 700, q: 2, duration: 0.5, volume: 0.75, attack: 0.05 });
    this.tone({ wave: 'sawtooth', freq: 85, to: 55, duration: 0.5, volume: 0.14, attack: 0.05 });
  }

  /** The fireball leaves the dragon's mouth. */
  fireball(): void {
    this.noise({ filter: 'bandpass', freq: 500, to: 2200, q: 1, duration: 0.4, volume: 0.6, attack: 0.08 });
  }

  /** The fireball hits the player. */
  playerHurt(): void {
    this.tone({ freq: 110, to: 38, duration: 0.35, volume: 0.55 });
    this.noise({ filter: 'lowpass', freq: 900, to: 150, duration: 0.25, volume: 0.4 });
  }

  /** A duel turn passes to you: a short rising ping. */
  yourTurn(): void {
    this.tone({ freq: hz(88), duration: 0.14, volume: 0.2 });
    this.tone({ freq: hz(93), at: 0.09, duration: 0.22, volume: 0.2 });
  }

  /** One of the last seconds before the dragon's timed attack. */
  tick(): void {
    this.tone({ freq: 1320, duration: 0.05, volume: 0.12 });
  }

  /** The dragon collapses. */
  dragonFall(): void {
    this.tone({ wave: 'sawtooth', freq: 120, to: 40, duration: 1, volume: 0.12, attack: 0.05 });
    this.noise({ filter: 'lowpass', freq: 600, to: 100, duration: 1, volume: 0.3, attack: 0.05 });
  }

  /** Battle won: a rising arpeggio and a held chord. */
  victory(): void {
    [72, 76, 79, 84].forEach((note, i) => {
      this.tone({ wave: 'triangle', freq: hz(note), at: i * 0.12, duration: 0.25, volume: 0.2 });
    });
    for (const note of [72, 76, 79, 84]) {
      this.tone({ wave: 'triangle', freq: hz(note), at: 0.5, duration: 1.1, volume: 0.1, attack: 0.02 });
    }
  }

  /** Battle lost: a slow falling minor line. */
  defeat(): void {
    [67, 63, 60].forEach((note, i) => {
      this.tone({ wave: 'triangle', freq: hz(note), at: i * 0.28, duration: 0.5, volume: 0.2 });
    });
    this.tone({ freq: hz(48), at: 0.84, duration: 1.2, volume: 0.25, attack: 0.03 });
  }

  private tone(options: ToneOptions): void {
    const t = this.ctx.currentTime + (options.at ?? 0);
    const end = t + options.duration;
    const osc = this.ctx.createOscillator();
    osc.type = options.wave ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, t);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, end);
    osc.connect(this.envelope(t, end, options.volume, options.attack));
    osc.start(t);
    osc.stop(end + 0.02);
  }

  private noise(options: NoiseOptions): void {
    const t = this.ctx.currentTime + (options.at ?? 0);
    const end = t + options.duration;
    const source = this.ctx.createBufferSource();
    source.buffer = this.whiteNoise();
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q ?? 0.7;
    filter.frequency.setValueAtTime(options.freq, t);
    if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, end);
    source.connect(filter).connect(this.envelope(t, end, options.volume, options.attack));
    source.start(t);
    source.stop(end + 0.02);
  }

  /** A gain node that fades in over `attack` and decays exponentially to silence at `end`. */
  private envelope(start: number, end: number, volume: number, attack = 0.005): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(this.out);
    return gain;
  }

  /** One second of white noise, made once and looped by every noise source. */
  private whiteNoise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }
}
