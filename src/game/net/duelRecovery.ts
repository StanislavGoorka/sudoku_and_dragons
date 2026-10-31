import { profileSuffix } from '../profile.ts';
import { findActiveDuel, findDuel, type DuelRow, type Joined, type Me } from './online.ts';

const KEY = `sudoku-dragons.duel-resume${profileSuffix}`;
interface Remembered { user: string; id: string }

function remembered(): Remembered | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && typeof value.user === 'string' && typeof value.id === 'string' ? value : null;
  } catch { return null; }
}

/** Only identity is saved; board, HP, turn and result always come from the server under RLS. */
export function rememberDuel(row: DuelRow, me: Me): void {
  if (row.player0 !== me.id && row.player1 !== me.id) return;
  try { localStorage.setItem(KEY, JSON.stringify({ user: me.id, id: row.id })); } catch { /* Discovery still works. */ }
}

export function forgetDuel(id?: string): void {
  try {
    if (id === undefined || remembered()?.id === id) localStorage.removeItem(KEY);
  } catch { /* Storage can be unavailable. */ }
}

export interface RecoverySource {
  find(id: string): Promise<DuelRow | null>;
  active(user: string): Promise<DuelRow | null>;
}

/** A missing local pointer is not a missing match. Failed reads preserve the pointer for retry. */
export async function recoverDuel(me: Me, source: RecoverySource = { find: findDuel, active: findActiveDuel }): Promise<Joined | null> {
  const pointer = remembered();
  let row = pointer?.user === me.id ? await source.find(pointer.id) : null;
  const own = (d: DuelRow) => d.player0 === me.id || d.player1 === me.id;
  if (row && (!own(row) || row.status === 'cancelled')) row = null;
  if (!row) row = await source.active(me.id);
  if (!row || !own(row) || row.status === 'cancelled') {
    if (pointer?.user === me.id) forgetDuel(pointer.id);
    return null;
  }
  rememberDuel(row, me);
  return { duel: row, seat: row.player0 === me.id ? 0 : 1 };
}
