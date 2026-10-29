import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, DEFAULT_BOARD_THEME, boardTheme } from './boardThemes.ts';

/** WCAG relative luminance of a 0xRRGGBB colour. */
function luminance(rgb: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((rgb >> 16) & 255) + 0.7152 * channel((rgb >> 8) & 255) + 0.0722 * channel(rgb & 255);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(rgb: number): number {
  const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('board themes', () => {
  it('have unique ids, one free theme (the default) and rising prices', () => {
    expect(new Set(BOARD_THEMES.map((t) => t.id)).size).toBe(BOARD_THEMES.length);
    expect(BOARD_THEMES.filter((t) => t.price === 0).map((t) => t.id)).toEqual([DEFAULT_BOARD_THEME]);
    const prices = BOARD_THEMES.map((t) => t.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(boardTheme('no-such-theme').id).toBe(DEFAULT_BOARD_THEME);
  });

  // Digits are big and bold, so 3:1 (WCAG large text) on plain cells; highlighted cells only ever
  // hold digits next to the selection, so a little less there.
  for (const { name, colors: c } of BOARD_THEMES) {
    it(`${name}: every digit reads clearly on every cell`, () => {
      for (const background of [c.cell, c.cellAlt, c.cellPeer, c.cellSameDigit, c.cellSelected]) {
        expect(contrast(c.given, background)).toBeGreaterThanOrEqual(4.5);
      }
      for (const digit of [c.placed, c.opponent]) {
        for (const background of [c.cell, c.cellAlt]) expect(contrast(digit, background)).toBeGreaterThanOrEqual(3);
        for (const background of [c.cellPeer, c.cellSameDigit, c.cellSelected]) expect(contrast(digit, background)).toBeGreaterThanOrEqual(2);
      }
      expect(contrast(c.padDigit, c.padKey)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: your digits and the rival's differ in hue`, () => {
      const gap = Math.abs(hue(c.placed) - hue(c.opponent));
      expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(75);
    });
  }
});
