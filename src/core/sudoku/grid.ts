/** 81 cells in row-major order. 0 means empty, 1–9 are digits. */
export type Grid = number[];

export const CELL_COUNT = 81;

export type UnitKind = 'row' | 'col' | 'box';

export interface Unit {
  kind: UnitKind;
  /** 0–8: row/column number, or box number counted left-to-right, top-to-bottom. */
  index: number;
}

export function rowOf(cell: number): number {
  return Math.floor(cell / 9);
}

export function colOf(cell: number): number {
  return cell % 9;
}

export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
}

export function unitCells(unit: Unit): number[] {
  const cells: number[] = [];
  for (let k = 0; k < 9; k++) {
    switch (unit.kind) {
      case 'row':
        cells.push(unit.index * 9 + k);
        break;
      case 'col':
        cells.push(k * 9 + unit.index);
        break;
      case 'box': {
        const top = Math.floor(unit.index / 3) * 3;
        const left = (unit.index % 3) * 3;
        cells.push((top + Math.floor(k / 3)) * 9 + left + (k % 3));
        break;
      }
    }
  }
  return cells;
}

/** The three units (row, column, box) that contain a cell. */
export function unitsOf(cell: number): Unit[] {
  return [
    { kind: 'row', index: rowOf(cell) },
    { kind: 'col', index: colOf(cell) },
    { kind: 'box', index: boxOf(cell) },
  ];
}

/** All 27 units of the board. */
export const ALL_UNITS: readonly Unit[] = (['row', 'col', 'box'] as const).flatMap((kind) =>
  Array.from({ length: 9 }, (_, index) => ({ kind, index })),
);

/** For each cell, the 20 other cells that share its row, column or box. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const peers = new Set<number>();
  for (const unit of unitsOf(cell)) {
    for (const other of unitCells(unit)) {
      if (other !== cell) peers.add(other);
    }
  }
  return [...peers].sort((a, b) => a - b);
});

/** Parses 81 characters; digits 1–9 are values, '0' or '.' are empty. Whitespace is ignored. */
export function parseGrid(text: string): Grid {
  const chars = text.replace(/\s+/g, '');
  if (chars.length !== CELL_COUNT) {
    throw new Error(`Expected ${CELL_COUNT} cells, got ${chars.length}`);
  }
  return [...chars].map((ch) => {
    if (ch === '.' || ch === '0') return 0;
    const digit = Number(ch);
    if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
      throw new Error(`Invalid cell character: '${ch}'`);
    }
    return digit;
  });
}

export function formatGrid(grid: Grid): string {
  return grid.map((value) => (value === 0 ? '.' : String(value))).join('');
}

/** True when every cell is filled and every unit contains 1–9 exactly once. */
export function isSolved(grid: Grid): boolean {
  if (grid.length !== CELL_COUNT) return false;
  return ALL_UNITS.every((unit) => {
    const seen = new Set(unitCells(unit).map((cell) => grid[cell]));
    return seen.size === 9 && !seen.has(0);
  });
}
