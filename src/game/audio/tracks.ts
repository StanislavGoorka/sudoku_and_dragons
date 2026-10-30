/**
 * The background music as data: three looping tracks written like a tracker, a bar of eight eighth-note steps
 * at a time. Every note is in C major, so the digits' pentatonic notes (Synth) always fit over the music.
 * Pure (no Web Audio): `Music` plays what `compileTrack` makes of a track.
 */

export type TrackId = 'menu' | 'battle' | 'duel';
export type Layer = 'pad' | 'bass' | 'arp' | 'lead' | 'drums';
export type Drum = 'kick' | 'snare' | 'hat';
/** How the tune sounds: soft and breathy for the menu, bright for a battle, plucked for a duel. */
export type LeadTone = 'soft' | 'bright' | 'pluck';

export interface TrackSpec {
  /** Beats per minute; a bar is four beats. */
  bpm: number;
  /** One chord per bar, e.g. "C Am F G" (major, or minor with "m"). */
  chords: string;
  /** The tune, bar by bar ("|" between bars): a note ("e5"), "-" holds the note before, "." rests. */
  lead: string;
  /** One bar played under every chord: R root, 3 third, 5 fifth, O octave; "-" and "." as in the lead. */
  bass: string;
  /** One bar played over every chord: 1–6 climb the chord from `arpFrom` (4 is 1 an octave up). */
  arp: string;
  /** The lowest MIDI note the arpeggio's chord may start on. */
  arpFrom: number;
  /** One bar: k kick, s snare, h hi-hat, together as in "kh"; "." nothing. */
  drums?: string;
  /** The layers that play in each pass through the chords; after the last pass the first comes again. */
  passes: Layer[][];
  leadTone: LeadTone;
}

export interface MusicNote {
  layer: Layer;
  /** Steps (eighth notes) from the start of the bar. */
  step: number;
  /** In steps. */
  length: number;
  /** MIDI note number (0 for drums). */
  midi: number;
  drum?: Drum;
}

export interface Track {
  id: TrackId;
  stepSeconds: number;
  barSeconds: number;
  /** Every note of every bar, by bar. */
  bars: MusicNote[][];
  passes: Layer[][];
  leadTone: LeadTone;
}

export const STEPS_PER_BAR = 8;
/** The pad's chord sits from E3 up, under the arpeggio and the tune. */
const PAD_FROM = 52;
/** The bass plays from C2 up. */
const BASS_FROM = 36;

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "e5" to its MIDI number (C4 = 60). */
export function noteNumber(name: string): number {
  const match = /^([a-g])(#?)(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note: "${name}"`);
  return 12 * (Number(match[3]) + 1) + PITCH[match[1]] + (match[2] ? 1 : 0);
}

/** The pitch classes of a chord: root, third, fifth. */
export function chordTones(name: string): [number, number, number] {
  const match = /^([A-G])(m?)$/.exec(name);
  if (!match) throw new Error(`Not a chord: "${name}"`);
  const root = PITCH[match[1].toLowerCase()];
  return [root, (root + (match[2] ? 3 : 4)) % 12, (root + 7) % 12];
}

/** The chord's notes from `from` up: each pitch class once, all within an octave. */
function voicing(tones: readonly number[], from: number): number[] {
  return tones.map((pc) => from + ((((pc - from) % 12) + 12) % 12)).sort((a, b) => a - b);
}

function steps(bar: string, where: string): string[] {
  const tokens = bar.trim().split(/\s+/);
  if (tokens.length !== STEPS_PER_BAR) throw new Error(`${where}: ${tokens.length} steps instead of ${STEPS_PER_BAR}`);
  return tokens;
}

/** One bar of tokens as notes: `pitch` reads a note token, "-" lengthens the note before, "." rests. */
function notesOf(tokens: readonly string[], layer: Layer, pitch: (token: string) => number): MusicNote[] {
  const notes: MusicNote[] = [];
  let last: MusicNote | null = null;
  tokens.forEach((token, step) => {
    if (token === '-') {
      if (last) last.length++;
    } else if (token === '.') {
      last = null;
    } else {
      last = { layer, step, length: 1, midi: pitch(token) };
      notes.push(last);
    }
  });
  return notes;
}

const DRUMS: Record<string, Drum> = { k: 'kick', s: 'snare', h: 'hat' };

export function compileTrack(id: TrackId, spec: TrackSpec): Track {
  const chords = spec.chords.trim().split(/\s+/);
  const leadBars = spec.lead.split('|');
  if (leadBars.length !== chords.length) throw new Error(`${id}: ${leadBars.length} bars of tune for ${chords.length} chords`);
  const bass = steps(spec.bass, `${id} bass`);
  const arp = steps(spec.arp, `${id} arp`);
  const drums = spec.drums ? steps(spec.drums, `${id} drums`) : null;

  const bars = chords.map((name, i) => {
    const tones = chordTones(name);
    const root = voicing([tones[0]], BASS_FROM)[0];
    const third = root + ((tones[1] - tones[0] + 12) % 12);
    const bassNotes: Record<string, number> = { R: root, '3': third, '5': root + 7, O: root + 12 };
    const chord = voicing(tones, spec.arpFrom);
    const ladder = [...chord, ...chord.map((note) => note + 12)];
    const notes: MusicNote[] = [
      ...voicing(tones, PAD_FROM).map((midi): MusicNote => ({ layer: 'pad', step: 0, length: STEPS_PER_BAR, midi })),
      ...notesOf(bass, 'bass', (token) => {
        if (!(token in bassNotes)) throw new Error(`${id} bass: "${token}"`);
        return bassNotes[token];
      }),
      ...notesOf(arp, 'arp', (token) => {
        const note = ladder[Number(token) - 1];
        if (note === undefined) throw new Error(`${id} arp: "${token}"`);
        return note;
      }),
      ...notesOf(steps(leadBars[i], `${id} tune bar ${i + 1}`), 'lead', noteNumber),
    ];
    drums?.forEach((token, step) => {
      if (token === '.') return;
      for (const letter of token) {
        const drum = DRUMS[letter];
        if (!drum) throw new Error(`${id} drums: "${token}"`);
        notes.push({ layer: 'drums', step, length: 1, midi: 0, drum });
      }
    });
    return notes;
  });

  const stepSeconds = 60 / spec.bpm / 2;
  return { id, stepSeconds, barSeconds: stepSeconds * STEPS_PER_BAR, bars, passes: spec.passes, leadTone: spec.leadTone };
}

const FULL: Layer[] = ['pad', 'bass', 'arp', 'lead', 'drums'];
/** Every third pass the tune rests, so a long battle does not hear it over and over. */
const BREATHER: Layer[] = ['pad', 'bass', 'arp', 'drums'];

export const TRACK_SPECS: Record<TrackId, TrackSpec> = {
  // Calm: a slow music box over a soft pad, a tune that wanders up and comes home.
  menu: {
    bpm: 80,
    chords: 'C G Am F C G F G Am F C G F G C C',
    lead: `
      g4 - c5 - e5 - d5 c5 | d5 - - - b4 - g4 - | a4 - c5 - e5 - g5 e5 | f5 - - - e5 - c5 - |
      g4 - c5 - e5 - g5 - | g5 - - a5 g5 - d5 - | c5 - f5 - a5 - g5 f5 | d5 - - - b4 - - - |
      e5 - - - a5 - g5 e5 | f5 - - - c5 - - - | e5 - g5 - c6 - b5 a5 | g5 - - - d5 - - - |
      a4 - c5 - f5 - e5 c5 | d5 - - - g5 - - - | e5 - d5 - c5 - - - | . . . . . . . .`,
    bass: 'R - - - 5 - - -',
    arp: '1 3 2 3 1 3 2 3',
    arpFrom: 60,
    passes: [FULL, FULL, BREATHER],
    leadTone: 'soft',
  },
  // A battle: A minor, driving bass in eighths, drums, a bright heroic tune.
  battle: {
    bpm: 128,
    chords: 'Am F C G Am F G G F G Em Am F G Am Am',
    lead: `
      e5 - - a4 - c5 e5 - | f5 - e5 - c5 - a4 - | g4 - c5 - e5 - g5 - | d5 - - - - - . . |
      e5 - - a4 - c5 e5 - | f5 - e5 - f5 - a5 - | g5 - - d5 - b4 d5 - | g5 - - - - - . . |
      a5 - - g5 f5 - c5 - | d5 - g5 - - - b4 - | e5 - - b4 - e5 g5 - | a5 - - - - - . . |
      c5 - f5 - a5 - g5 f5 | d5 - g5 - b5 - a5 g5 | a5 - - - e5 - c5 - | a4 - - - . . . .`,
    bass: 'R R O R R R O R',
    arp: '1 2 3 2 1 2 3 4',
    arpFrom: 57,
    drums: 'kh h sh h kh kh sh h',
    passes: [FULL, FULL, BREATHER],
    leadTone: 'bright',
  },
  // A duel: D minor with the bright B of the dorian mode, a 3-3-2 groove, a plucked tune.
  duel: {
    bpm: 116,
    chords: 'Dm G Dm G F C G G Am Dm F C Dm G Am Am',
    lead: `
      d5 - f5 - a5 - f5 d5 | b4 - d5 - g5 - - - | a4 - d5 - f5 - e5 d5 | d5 - - - b4 - g4 - |
      c5 - f5 - a5 - g5 f5 | e5 - g5 - c6 - g5 e5 | d5 - g4 - b4 - d5 - | g5 - - - - - . . |
      e5 - - a5 - - g5 - | f5 - - e5 - - d5 - | c5 - - f5 - - a5 - | g5 - - - e5 - c5 - |
      d5 - f5 - a5 - - g5 | b4 - d5 - g5 - - f5 | e5 - - - c5 - a4 - | e5 - - - . . . .`,
    bass: 'R - - R - - O -',
    arp: '1 . 3 2 . 3 4 .',
    arpFrom: 57,
    drums: 'kh h h kh sh h kh h',
    passes: [FULL, FULL, BREATHER],
    leadTone: 'pluck',
  },
};

export const TRACKS: Record<TrackId, Track> = {
  menu: compileTrack('menu', TRACK_SPECS.menu),
  battle: compileTrack('battle', TRACK_SPECS.battle),
  duel: compileTrack('duel', TRACK_SPECS.duel),
};
