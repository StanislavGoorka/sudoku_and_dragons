/** Colours of the board and the number pad under it: everything a board theme changes. */
export interface BoardColors {
  /** The tray the cells sit in, and the darker lip under it. */
  frame: number;
  frameLip: number;
  boxLine: number;
  lineThin: number;
  cell: number;
  /** Cells of every other 3×3 box (a checker of boxes); the same as `cell` for a plain board. */
  cellAlt: number;
  /** Cells sharing a row, column or box with the selected one. */
  cellPeer: number;
  /** Cells holding the selected cell's digit. */
  cellSameDigit: number;
  cellSelected: number;
  /** Digits printed on the board from the start. */
  given: number;
  /** Your digits; also your orbs. */
  placed: number;
  /** The rival's digits and orbs in a duel. */
  opponent: number;
  padKey: number;
  padKeyLip: number;
  padDigit: number;
  /** A key whose digit is all on the board. */
  padKeyDone: number;
  padKeyDoneLip: number;
  padDigitDone: number;
}

export interface BoardTheme {
  id: string;
  /** Polish, shown in the shop. */
  name: string;
  /** Stars to buy it; 0 for the one everyone has. */
  price: number;
  colors: BoardColors;
}

export const DEFAULT_BOARD_THEME = 'violet';

/**
 * Board looks bought with stars, cheapest first. Each keeps the sudoku easy to read: dark digits on
 * light cells (or light on dark for the night board), your digits and the rival's in clearly different
 * colours, none of them red (red means a mistake). boardThemes.test.ts checks the contrast.
 */
export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'violet',
    name: 'Fiołek',
    price: 0,
    colors: {
      frame: 0x5a3fd0,
      frameLip: 0x33208c,
      boxLine: 0x6a52d6,
      lineThin: 0xd6cbf5,
      cell: 0xfbf8ff,
      cellAlt: 0xfbf8ff,
      cellPeer: 0xebe3ff,
      cellSameDigit: 0xd5c4ff,
      cellSelected: 0xffd94a,
      given: 0x2b2156,
      placed: 0x20569b,
      opponent: 0x8d4010,
      padKey: 0xffffff,
      padKeyLip: 0xb9a8ee,
      padDigit: 0x4a32b8,
      padKeyDone: 0x3a2a86,
      padKeyDoneLip: 0x21175a,
      padDigitDone: 0x6858ab,
    },
  },
  {
    id: 'meadow',
    name: 'Łąka',
    price: 15,
    colors: {
      frame: 0x34b05c,
      frameLip: 0x1c7a3c,
      boxLine: 0x2f9a52,
      lineThin: 0xcbe8cf,
      cell: 0xfbfff5,
      cellAlt: 0xeff8e3,
      cellPeer: 0xdff2cf,
      cellSameDigit: 0xbfe5a0,
      cellSelected: 0xffd94a,
      given: 0x1c3a24,
      placed: 0x195fab,
      opponent: 0xa0410b,
      padKey: 0xffffff,
      padKeyLip: 0x9fd4a8,
      padDigit: 0x1f7a3d,
      padKeyDone: 0x22603a,
      padKeyDoneLip: 0x123e24,
      padDigitDone: 0x5f9c72,
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    price: 25,
    colors: {
      frame: 0x1f8fd8,
      frameLip: 0x115c9c,
      boxLine: 0x2582c6,
      lineThin: 0xc6e2f4,
      cell: 0xf6fcff,
      cellAlt: 0xf6fcff,
      cellPeer: 0xdaeffb,
      cellSameDigit: 0xb0dcf6,
      cellSelected: 0x8ff0d2,
      given: 0x12304c,
      placed: 0x08695b,
      opponent: 0x9b400b,
      padKey: 0xffffff,
      padKeyLip: 0x9ccbee,
      padDigit: 0x1565a6,
      padKeyDone: 0x174a78,
      padKeyDoneLip: 0x0d3053,
      padDigitDone: 0x5b8fbd,
    },
  },
  {
    id: 'candy',
    name: 'Cukierek',
    price: 35,
    colors: {
      frame: 0xff6fae,
      frameLip: 0xcc3f7e,
      boxLine: 0xec5f9e,
      lineThin: 0xf8d2e4,
      cell: 0xfffafc,
      cellAlt: 0xffeff6,
      cellPeer: 0xffe0ee,
      cellSameDigit: 0xffc2dc,
      cellSelected: 0x9ff0dc,
      given: 0x58183f,
      placed: 0x6d38c7,
      opponent: 0x0b6663,
      padKey: 0xffffff,
      padKeyLip: 0xf4b0cf,
      padDigit: 0xcc3a80,
      padKeyDone: 0x8a2b5e,
      padKeyDoneLip: 0x5c1a3e,
      padDigitDone: 0xc77aa2,
    },
  },
  {
    id: 'volcano',
    name: 'Wulkan',
    price: 50,
    colors: {
      frame: 0xf0642a,
      frameLip: 0xae3812,
      boxLine: 0xdc5f28,
      lineThin: 0xf6d5c0,
      cell: 0xfffaf2,
      cellAlt: 0xfff0df,
      cellPeer: 0xffe4cd,
      cellSameDigit: 0xffc89e,
      cellSelected: 0xffe14d,
      given: 0x47190a,
      placed: 0x195aa8,
      opponent: 0x236823,
      padKey: 0xffffff,
      padKeyLip: 0xf2b892,
      padDigit: 0xc0431a,
      padKeyDone: 0x7a2a12,
      padKeyDoneLip: 0x50190a,
      padDigitDone: 0xc27556,
    },
  },
  {
    id: 'night',
    name: 'Noc',
    price: 65,
    colors: {
      frame: 0x4b3bb0,
      frameLip: 0x241a66,
      boxLine: 0x8a76f0,
      lineThin: 0x3c3080,
      cell: 0x1c1547,
      cellAlt: 0x221a54,
      cellPeer: 0x2e246e,
      cellSameDigit: 0x45379a,
      cellSelected: 0x8c2a8f,
      given: 0xf3eeff,
      placed: 0x7bd5ff,
      opponent: 0xffbd7b,
      padKey: 0x3b2f8c,
      padKeyLip: 0x1d1650,
      padDigit: 0xe2d8ff,
      padKeyDone: 0x1a1442,
      padKeyDoneLip: 0x0d0a28,
      padDigitDone: 0x5a4f96,
    },
  },
  {
    id: 'treasure',
    name: 'Skarbiec',
    price: 90,
    colors: {
      frame: 0xe8a522,
      frameLip: 0xa1650a,
      boxLine: 0xc98f1c,
      lineThin: 0xeedcaf,
      cell: 0xfffbee,
      cellAlt: 0xfcf1d4,
      cellPeer: 0xf8e8c2,
      cellSameDigit: 0xf1d58a,
      cellSelected: 0x9fe6bf,
      given: 0x3b2905,
      placed: 0x0b6a4b,
      opponent: 0x8036c1,
      padKey: 0xffffff,
      padKeyLip: 0xe4c27a,
      padDigit: 0x96600a,
      padKeyDone: 0x6b4a10,
      padKeyDoneLip: 0x45300a,
      padDigitDone: 0xb38f4c,
    },
  },
];

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === id) ?? BOARD_THEMES[0];
}
