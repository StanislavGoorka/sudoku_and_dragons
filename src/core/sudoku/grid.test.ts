import { describe, expect, it } from 'vitest';
import { ALL_UNITS, boxOf, formatGrid, isSolved, parseGrid, PEERS, unitCells } from './grid.ts';

const SOLVED = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

describe('grid', () => {
  it('maps cells to boxes', () => {
    expect(boxOf(0)).toBe(0);
    expect(boxOf(8)).toBe(2);
    expect(boxOf(40)).toBe(4);
    expect(boxOf(80)).toBe(8);
  });

  it('lists box cells in reading order', () => {
    expect(unitCells({ kind: 'box', index: 4 })).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
  });

  it('has 27 units and 20 peers per cell', () => {
    expect(ALL_UNITS).toHaveLength(27);
    expect(PEERS.every((peers) => peers.length === 20)).toBe(true);
  });

  it('round-trips through parse and format', () => {
    const text = '.3.' + '0'.repeat(78);
    expect(formatGrid(parseGrid(text))).toBe('.3.' + '.'.repeat(78));
  });

  it('rejects malformed input', () => {
    expect(() => parseGrid('123')).toThrow();
    expect(() => parseGrid('x'.repeat(81))).toThrow();
  });

  it('recognises a solved board', () => {
    expect(isSolved(parseGrid(SOLVED))).toBe(true);
    const swapped = parseGrid(SOLVED);
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isSolved(swapped)).toBe(false);
  });
});
