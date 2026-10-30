import { describe, expect, it } from 'vitest';
import { chordTones, compileTrack, noteNumber, STEPS_PER_BAR, TRACK_SPECS, TRACKS, type TrackId } from './tracks.ts';

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const ids = Object.keys(TRACKS) as TrackId[];

describe('music notation', () => {
  it('reads notes and chords', () => {
    expect(noteNumber('c4')).toBe(60);
    expect(noteNumber('a4')).toBe(69);
    expect(noteNumber('f#3')).toBe(54);
    expect(chordTones('C')).toEqual([0, 4, 7]);
    expect(chordTones('Am')).toEqual([9, 0, 4]);
    expect(() => noteNumber('h4')).toThrow();
    expect(() => chordTones('Cmaj7')).toThrow();
  });

  it('refuses a bar of the wrong length', () => {
    expect(() => compileTrack('menu', { ...TRACK_SPECS.menu, bass: 'R - - -' })).toThrow(/4 steps/);
    expect(() => compileTrack('menu', { ...TRACK_SPECS.menu, lead: 'c5 - - - - - - -' })).toThrow(/1 bars of tune/);
  });
});

describe('the tracks', () => {
  for (const id of ids) {
    const track = TRACKS[id];
    const chords = TRACK_SPECS[id].chords.trim().split(/\s+/);

    it(`${id}: every note is in C major, so the digits' notes fit over it`, () => {
      for (const note of track.bars.flat()) if (note.layer !== 'drums') expect(C_MAJOR.has(note.midi % 12)).toBe(true);
    });

    it(`${id}: notes stay inside their bar and their range`, () => {
      for (const note of track.bars.flat()) {
        expect(note.step + note.length).toBeLessThanOrEqual(STEPS_PER_BAR);
        if (note.layer === 'lead') expect(note.midi).toBeGreaterThanOrEqual(60);
        if (note.layer === 'lead') expect(note.midi).toBeLessThanOrEqual(86);
        if (note.layer === 'bass') expect(note.midi).toBeLessThan(60);
      }
    });

    it(`${id}: each bar of the tune starts on a note of its chord`, () => {
      track.bars.forEach((bar, i) => {
        const first = bar.find((note) => note.layer === 'lead' && note.step === 0);
        if (first) expect(chordTones(chords[i])).toContain(first.midi % 12);
      });
    });

    it(`${id}: the tune comes in at once, and rests in some pass`, () => {
      expect(track.passes[0]).toContain('lead');
      expect(track.passes.some((pass) => !pass.includes('lead'))).toBe(true);
    });
  }

  it('the menu is calm and the fights are livelier, with drums', () => {
    const notesPerSecond = (id: TrackId) => TRACKS[id].bars.flat().length / (TRACKS[id].bars.length * TRACKS[id].barSeconds);
    expect(TRACKS.menu.bars.flat().some((note) => note.layer === 'drums')).toBe(false);
    for (const id of ['battle', 'duel'] as const) {
      expect(TRACKS[id].barSeconds).toBeLessThan(TRACKS.menu.barSeconds);
      expect(TRACKS[id].bars.flat().some((note) => note.drum === 'kick')).toBe(true);
      expect(notesPerSecond(id)).toBeGreaterThan(notesPerSecond('menu') * 1.5);
    }
  });
});
