/**
 * Colours and fonts. The look: a deep violet night behind everything, colourful scenes for the
 * dragons, chunky buttons with a darker lip under the face, and a light board with dark digits so
 * the sudoku itself always reads clearly.
 */
export const theme = {
  /** Clear colour of the app, under the backdrop. */
  background: 0x160f36,
  backdropTop: 0x33207a,
  backdropBottom: 0x140e33,
  backdropGlow: 0x8a5cff,

  /** Panels and dialogs: the face, a lighter top edge, and the darker lip under them. */
  panel: 0x3a2a86,
  panelLight: 0x5340b0,
  panelLip: 0x21175a,

  /** Text on the dark backdrop and on panels. */
  text: 0xfdf8ff,
  textMuted: 0xbcaef0,
  /** Text on light surfaces (board, keys, gold buttons). */
  textDark: 0x2b2156,

  /** Buttons: face, lip under it, and text. */
  buttonPrimary: 0xffc53d,
  buttonPrimaryLip: 0xd27a16,
  buttonPrimaryText: 0x5a2b00,
  buttonSecondary: 0x6f55e6,
  buttonSecondaryLip: 0x4330a8,
  buttonAccent: 0x2fb2ff,
  buttonAccentLip: 0x1874bd,

  /** The board: light cells, a violet frame and box lines. */
  boardFrame: 0x5a3fd0,
  boardFrameLip: 0x33208c,
  boxLine: 0x6a52d6,
  lineThin: 0xd6cbf5,
  cell: 0xfbf8ff,
  cellPeer: 0xebe3ff,
  cellSameDigit: 0xd5c4ff,
  cellSelected: 0xffd94a,
  given: 0x2b2156,
  /** Your digits; also your orbs and your colour in a duel. */
  placed: 0x2f7de1,
  /** Digits placed by the opponent in a duel. */
  opponent: 0xf07a2a,

  /** Number pad keys. */
  padKey: 0xffffff,
  padKeyLip: 0xb9a8ee,
  padDigit: 0x4a32b8,
  padKeyDone: 0x3a2a86,

  error: 0xff4d5e,
  flash: 0xffd94a,
  gold: 0xffc53d,
  fire: 0xff7a1a,
  combo: 0xffb347,

  hpTrack: 0x1a1240,
  hpTrail: 0xffe3a3,
  enemyHp: 0xff4f6a,
  playerHp: 0x4fd16b,

  /** Baloo 2 (bundled, see main.ts): rounded and bold, with every Polish letter. */
  fontFamily: '"Baloo 2", system-ui, sans-serif',
} as const;
