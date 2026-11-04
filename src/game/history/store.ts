import { parseReplay, type Replay } from './replay.ts';
import { HISTORY_KEY, onHistoryCleared } from './storageKey.ts';

export const HISTORY_LIMIT = 30;
let items: Replay[] | undefined;
let saved = true;
onHistoryCleared(() => { items = []; saved = true; });

export function battleHistory(): readonly Replay[] {
  if (items) return items;
  items = [];
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null');
    if (raw?.version !== 1 || !Array.isArray(raw.items)) return items;
    const ids = new Set<string>();
    for (const value of raw.items.slice(0, HISTORY_LIMIT)) {
      const replay = parseReplay(value);
      if (replay && !ids.has(replay.id)) { items.push(replay); ids.add(replay.id); }
    }
  } catch { saved = false; }
  return items;
}

export function historyPersisted(): boolean { return saved; }

export function addReplay(replay: Replay): Replay {
  if (!parseReplay(replay)) return replay;
  const list = battleHistory();
  const previous = list.find(r => r.id === replay.id);
  // Seeing a finished duel again after restart must not replace its fuller recording.
  if (previous && (!previous.partial || (replay.partial && previous.steps.length >= replay.steps.length))) return previous;
  const entry = structuredClone(replay);
  items = [entry, ...list.filter(r => r.id !== replay.id)].slice(0, HISTORY_LIMIT);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, items })); saved = true; }
  catch { saved = false; }
  return entry;
}
