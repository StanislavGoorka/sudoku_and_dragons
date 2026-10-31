export interface Settings {
  /** Sound effects. */
  sound: boolean;
  haptics: boolean;
  /** Music on, or muted (the volume is kept for when it comes back). */
  music: boolean;
  /** 0–1. */
  musicVolume: number;
  /** Technical reports only; no account data or gameplay payloads. */
  diagnostics: boolean;
}

const STORAGE_KEY = 'sudoku-dragons.settings';
const DEFAULTS: Settings = { sound: true, haptics: true, music: true, musicVolume: 0.6, diagnostics: true };

/** Saved settings, or the defaults. Storage can be missing or blocked, so failures fall back quietly. */
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
      haptics: typeof saved.haptics === 'boolean' ? saved.haptics : DEFAULTS.haptics,
      music: typeof saved.music === 'boolean' ? saved.music : DEFAULTS.music,
      diagnostics: typeof saved.diagnostics === 'boolean' ? saved.diagnostics : DEFAULTS.diagnostics,
      musicVolume:
        typeof saved.musicVolume === 'number' && saved.musicVolume >= 0 && saved.musicVolume <= 1
          ? saved.musicVolume
          : DEFAULTS.musicVolume,
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
