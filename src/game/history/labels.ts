import type { ReplayEvent, ReplayMode, ReplayResult } from './replay.ts';

export const MODE_LABEL: Record<ReplayMode, string> = {
  campaign: 'Kampania', daily: 'Wyzwanie dnia', practice: 'Trening solo', solo: 'Walka solo', bot: 'Trening z botem', online: 'Online',
};
export const RESULT_LABEL: Record<ReplayResult, string> = {
  won: 'Wygrana', lost: 'Porażka', draw: 'Remis', ongoing: 'W trakcie',
};

export function replayTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function eventLabel(event?: ReplayEvent): string {
  if (!event) return 'Stan początkowy zapisu';
  if (event.kind === 'gap') return 'Brak ruchów pośrednich. Oto kolejny znany stan.';
  if (event.kind === 'timer') return `Atak na czas: −${event.damage} HP`;
  const who = event.actor === 0 ? 'Ty' : 'Rywal';
  if (event.kind === 'timeout') return `${who} · koniec czasu tury`;
  if (event.kind === 'forfeit') return `${who} · przegrana walkowerem`;
  if (event.kind === 'wrong') return `${who} · błąd (${event.digit}), −${event.damage} HP`;
  if (event.kind === 'correct') {
    if (event.finisher) return `Rozwiązana plansza · cios kończący za ${event.damage} HP`;
    const names = { row: 'wiersz', col: 'kolumna', box: 'kwadrat ×2' };
    const units = event.units.map(u => names[u.kind]).join(', ');
    return `${who} · ${event.digit} → ${event.damage} obrażeń${units ? ` · ${units}` : ''}`;
  }
  return '';
}
