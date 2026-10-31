import { TRACKS, type MusicNote, type Track, type TrackId } from './tracks.ts';

/** How far ahead bars are scheduled. `update()` runs every 100 ms, so this also covers a late tick. */
const LOOKAHEAD = 0.6;
/** The music at 100% volume, so that even then it stays under the sound effects. */
const LEVEL = 0.55;
/** Seconds one track takes to fade into another. */
const CROSSFADE = 1.2;

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** One track playing: its own gain (for fading) and where it is in the loop. */
interface Playing {
  track: Track;
  out: GainNode;
  /** Bars played so far, counted across loops (the pass is bar / bars per loop). */
  bar: number;
  nextBarAt: number;
  /** Set once it fades out: it schedules nothing more, and lets go of its gain after this time. */
  endsAt: number | null;
}

/**
 * Background music, synthesised and scheduled on the audio clock a bar ahead, so it keeps time however
 * the frames go. One track plays at a time; a new one fades in over the last one. Works on any
 * BaseAudioContext, so an OfflineAudioContext can render it for checking (call `update(until)` first).
 */
export class Music {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private current: Playing | null = null;
  private readonly fading: Playing[] = [];
  private wanted: TrackId | null = null;
  private enabled = true;

  /** Keep scheduling only while playing or waiting to disconnect a faded track. */
  get needsUpdate(): boolean { return this.current !== null || this.fading.length > 0; }

  constructor(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(destination);
  }

  /** 0–1, as on the slider; the gain follows its square, closer to how loud it sounds. */
  setVolume(volume: number): void {
    const gain = LEVEL * Math.max(0, Math.min(1, volume)) ** 2;
    this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.03);
  }

  /** Off: nothing plays and nothing is scheduled. On again, the wanted track starts from its beginning. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.switchTo(enabled ? this.wanted : null, 0.25);
  }

  /** The track to play (null: silence). The one already playing goes on where it is. */
  play(id: TrackId | null, fade = CROSSFADE): void {
    if (id === this.wanted) return;
    this.wanted = id;
    if (this.enabled) this.switchTo(id, fade);
  }

  /** Schedules the bars that start before `until` (by default, a little ahead of now). */
  update(until = this.ctx.currentTime + LOOKAHEAD): void {
    const now = this.ctx.currentTime;
    for (let i = this.fading.length - 1; i >= 0; i--) {
      if (now < this.fading[i].endsAt!) continue;
      this.fading[i].out.disconnect();
      this.fading.splice(i, 1);
    }
    const playing = this.current;
    if (!playing) return;
    // Behind (the page got no time for a while): pick up from now rather than play the missed bars at once.
    if (playing.nextBarAt < now) playing.nextBarAt = now + 0.05;
    while (playing.nextBarAt < until) {
      this.playBar(playing, playing.nextBarAt);
      playing.bar++;
      playing.nextBarAt += playing.track.barSeconds;
    }
  }

  private switchTo(id: TrackId | null, fade: number): void {
    const now = this.ctx.currentTime;
    if (this.current) {
      const gain = this.current.out.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + fade);
      // Bars already scheduled may still sound until then; the gain has gone silent by the end of them.
      this.current.endsAt = now + fade + this.current.track.barSeconds + 1;
      this.fading.push(this.current);
      this.current = null;
    }
    if (!id) return;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + Math.min(fade, 0.8));
    out.connect(this.master);
    this.current = { track: TRACKS[id], out, bar: 0, nextBarAt: now + 0.1, endsAt: null };
    this.update();
  }

  private playBar(playing: Playing, start: number): void {
    const { track } = playing;
    const layers = track.passes[Math.floor(playing.bar / track.bars.length) % track.passes.length];
    const notes = track.bars[playing.bar % track.bars.length].filter((note) => layers.includes(note.layer));
    const chord = notes.filter((note) => note.layer === 'pad');
    if (chord.length > 0) {
      this.pad(playing.out, chord.map((note) => hz(note.midi)), start, track.barSeconds, track.leadTone === 'soft' ? 0.03 : 0.022);
    }
    for (const note of notes) {
      if (note.layer === 'pad') continue;
      const t = start + note.step * track.stepSeconds;
      this.voice(playing, note, t, note.length * track.stepSeconds);
    }
  }

  private voice(playing: Playing, note: MusicNote, t: number, length: number): void {
    const out = playing.out;
    const lively = playing.track.leadTone !== 'soft';
    switch (note.layer) {
      case 'bass':
        this.bass(out, hz(note.midi), t, length, lively);
        break;
      case 'arp':
        this.pluck(out, hz(note.midi), t, lively ? 0.04 : 0.055, lively ? 0.22 : 0.5);
        break;
      case 'lead':
        this.lead(out, hz(note.midi), t, length, playing.track.leadTone);
        break;
      case 'drums':
        if (note.drum === 'kick') this.kick(out, t);
        else if (note.drum === 'snare') this.snare(out, t);
        else this.hat(out, t);
        break;
    }
  }

  /**
   * A bar's held chord: each note two slightly detuned triangles, all softened by one filter, swelling in and
   * fading out over the start of the next bar.
   */
  private pad(out: AudioNode, freqs: number[], t: number, length: number, volume: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + Math.min(0.5, length / 3));
    gain.gain.setTargetAtTime(0, t + length, 0.2);
    filter.connect(gain).connect(out);
    for (const freq of freqs) for (const detune of [1, 1.004]) this.osc('triangle', freq * detune, t, t + length + 0.9, filter);
  }

  private bass(out: AudioNode, freq: number, t: number, length: number, lively: boolean): void {
    const end = t + length;
    const gain = this.ctx.createGain();
    const volume = lively ? 0.13 : 0.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.setTargetAtTime(volume * 0.6, t + 0.01, 0.12);
    gain.gain.setTargetAtTime(0, end - 0.03, 0.03);
    if (lively) {
      // A rounded saw: a bass that drives without buzzing over the board's sounds.
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      filter.Q.value = 1.5;
      filter.connect(gain);
      this.osc('sawtooth', freq, t, end + 0.2, filter);
    } else {
      this.osc('sine', freq, t, end + 0.2, gain);
      this.osc('triangle', freq * 2, t, end + 0.2, gain, 0.25);
    }
    gain.connect(out);
  }

  /** A short plucked note, like a music box, dying away. */
  private pluck(out: AudioNode, freq: number, t: number, volume: number, decay: number): void {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.setTargetAtTime(0, t + 0.005, decay / 3);
    gain.connect(out);
    this.osc('triangle', freq, t, t + decay * 1.6, gain);
  }

  private lead(out: AudioNode, freq: number, t: number, length: number, tone: Track['leadTone']): void {
    const end = t + length;
    const gain = this.ctx.createGain();
    gain.connect(out);
    if (tone === 'soft') {
      // A flute-like tune: a slow breath in, a gentle vibrato on held notes.
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.075, t + 0.06);
      gain.gain.setTargetAtTime(0.055, t + 0.06, 0.2);
      gain.gain.setTargetAtTime(0, end - 0.04, 0.08);
      const osc = this.osc('triangle', freq, t, end + 0.5, gain);
      this.osc('sine', freq * 2, t, end + 0.5, gain, 0.15);
      if (length > 0.5) {
        const lfo = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        lfo.frequency.value = 5;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(freq * 0.006, t + 0.4);
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(end + 0.5);
      }
      return;
    }
    // A fight: a filtered square, bright and a little retro.
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = tone === 'bright' ? 2000 : 2600;
    filter.connect(gain);
    const peak = tone === 'bright' ? 0.05 : 0.065;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.01);
    // Plucked notes die away; bright ones hold.
    gain.gain.setTargetAtTime(tone === 'pluck' ? peak * 0.25 : peak * 0.7, t + 0.01, tone === 'pluck' ? 0.12 : 0.1);
    gain.gain.setTargetAtTime(0, end - 0.03, 0.04);
    this.osc('square', freq, t, end + 0.25, filter);
  }

  private kick(out: AudioNode, t: number): void {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.setTargetAtTime(0, t + 0.02, 0.07);
    gain.connect(out);
    const osc = this.osc('sine', 160, t, t + 0.4, gain);
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  }

  private snare(out: AudioNode, t: number): void {
    this.noise(out, 'bandpass', 1900, t, 0.11, 0.045);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.setTargetAtTime(0, t, 0.025);
    gain.connect(out);
    this.osc('triangle', 190, t, t + 0.15, gain);
  }

  private hat(out: AudioNode, t: number): void {
    this.noise(out, 'highpass', 7000, t, 0.035, 0.012);
  }

  /** An oscillator into `into` (through a gain when `level` is below 1), playing from `t` to `end`. */
  private osc(type: OscillatorType, freq: number, t: number, end: number, into: AudioNode, level = 1): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (level < 1) {
      const gain = this.ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(into);
    } else {
      osc.connect(into);
    }
    osc.start(t);
    osc.stop(end);
    return osc;
  }

  /** A burst of filtered noise, `volume` at `t`, dying away over about `decay` seconds. */
  private noise(out: AudioNode, type: BiquadFilterType, freq: number, t: number, volume: number, decay: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.whiteNoise();
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.setTargetAtTime(0, t, decay / 2);
    source.connect(filter).connect(gain).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + decay * 4);
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
