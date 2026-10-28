export interface Settings {
  sound: boolean;
  haptics: boolean;
}

const STORAGE_KEY = 'sudoku-dragons.settings';
const DEFAULTS: Settings = { sound: true, haptics: true };

/** Saved settings, or the defaults. Storage can be missing or blocked, so failures fall back quietly. */
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
      haptics: typeof saved.haptics === 'boolean' ? saved.haptics : DEFAULTS.haptics,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The choice then lasts until the app closes.
  }
}
