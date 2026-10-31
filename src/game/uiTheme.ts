import { theme } from './theme.ts';

/** Interface only. Art, attack effects and sudoku themes retain their original palette and font. */
export const uiTheme = {
  ...theme,
  background: 0x0d1117,
  backdropTop: 0x0d1117,
  backdropBottom: 0x0d1117,
  backdropGlow: 0x0d1117,
  panel: 0x151c25,
  panelLight: 0x303b4a,
  panelLip: 0x202b39,
  text: 0xeef2f6,
  textMuted: 0x9ca9b9,
  textDark: 0x111a22,
  buttonPrimary: 0xb7d9ca,
  buttonPrimaryLip: 0xb7d9ca,
  buttonPrimaryText: 0x12251f,
  buttonSecondary: 0x18212c,
  buttonSecondaryLip: 0x354151,
  buttonAccent: 0x1c2b3b,
  buttonAccentLip: 0x3d536c,
  hpTrack: 0x263241,
  hpTrail: 0xc1cad6,
  enemyHp: 0xd39196,
  playerHp: 0x9acbb7,
  fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;
