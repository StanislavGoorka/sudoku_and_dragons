/** Original CC0 Kenney Game Icons, retained in assets/vendor for future UI work. */
export const iconFiles = {
  pause: 'pause', back: 'arrowLeft', gear: 'gear', palette: 'shoppingCart', user: 'singleplayer',
  map: 'menuGrid', speaker: 'audioOn', muted: 'audioOff', play: 'right', daily: 'trophy',
  multiplayer: 'multiplayer', star: 'star', medal: 'medal1', locked: 'locked',
  check: 'checkmark', home: 'home',
} as const;
export type UiIconName = keyof typeof iconFiles;
export const ICON_CELL = 64;
export const ICON_COLUMNS = 8;
