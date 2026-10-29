import { createClient } from '@supabase/supabase-js';
import type { Difficulty, DuelEvent, DuelState, Seat } from '../../core/index.ts';
import { SUPABASE_KEY, SUPABASE_URL } from './config.ts';

export interface DuelRow {
  id: string;
  mode: 'room' | 'random';
  code: string | null;
  difficulty: Difficulty;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  player0: string;
  player1: string | null;
  state: DuelState;
  last_event: DuelEvent | null;
  version: number;
  turn_started_at: string | null;
  /** After the end: the seat that asked for a rematch first. */
  rematch_by: Seat | null;
  /** A player left the end screen (or gave up): no rematch. */
  rematch_declined: boolean;
  /** The rematch duel, once both players asked. */
  next_duel: string | null;
}

export interface Me {
  id: string;
  nickname: string;
}

/** A failed online action; `code` is the server's error code, or 'network' / 'sign-in'. */
export class OnlineError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// In development, ?profile=2 gives a tab its own player, so one browser can play both sides.
const profile = import.meta.env.DEV ? new URLSearchParams(location.search).get('profile') : null;
const suffix = profile ? `-${profile}` : '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: `sudoku-dragons.auth${suffix}`, persistSession: true, autoRefreshToken: true },
});

/** Server clock minus ours, in ms, from the last response; turn countdowns use server time. */
let clockOffset = 0;

export function serverNow(): number {
  return Date.now() + clockOffset;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const sentAt = Date.now();
  const { data, error } = await supabase.functions.invoke('duel', { body: { action, ...payload } });
  if (error) {
    let code = 'network';
    try {
      code = (await (error as { context?: Response }).context?.json())?.error ?? code;
    } catch {
      // Not a JSON error body: keep 'network'.
    }
    throw new OnlineError(code);
  }
  // The server stamped its time roughly halfway through the round trip.
  clockOffset = data.serverTime - (sentAt + Date.now()) / 2;
  return data as T;
}

const TITLES = ['Rycerz', 'Mag', 'Łucznik', 'Druid', 'Paladyn', 'Bard', 'Łowca', 'Alchemik', 'Czarodziejka', 'Wojowniczka'];

function randomNickname(): string {
  return `${TITLES[Math.floor(Math.random() * TITLES.length)]} ${100 + Math.floor(Math.random() * 900)}`;
}

const NICKNAME_KEY = `sudoku-dragons.nickname${suffix}`;
/** The nickname the server has last confirmed. */
const SYNCED_KEY = `sudoku-dragons.nickname-synced${suffix}`;

/** The player's nickname: made up on the first visit and kept on this device, so it shows before sign-in. */
export function localNickname(): string {
  let nickname = localStorage.getItem(NICKNAME_KEY);
  if (!nickname) {
    nickname = randomNickname();
    localStorage.setItem(NICKNAME_KEY, nickname);
  }
  return nickname;
}

let connecting: Promise<Me> | null = null;

/**
 * Signs in (anonymously, once per device) and makes sure the server knows the nickname.
 * Everyone shares one attempt; after a failure the next call tries again.
 */
export function connect(): Promise<Me> {
  connecting ??= signIn().catch((error: unknown) => {
    connecting = null;
    throw error;
  });
  return connecting;
}

async function signIn(): Promise<Me> {
  let { data } = await supabase.auth.getSession();
  if (!data.session) {
    const signIn = await supabase.auth.signInAnonymously();
    if (signIn.error || !signIn.data.session) throw new OnlineError('sign-in');
    data = { session: signIn.data.session };
  }
  const nickname = localNickname();
  if (localStorage.getItem(SYNCED_KEY) !== nickname) {
    await call('profile', { nickname });
    localStorage.setItem(SYNCED_KEY, nickname);
  }
  return { id: data.session!.user.id, nickname };
}

export interface Joined {
  duel: DuelRow;
  seat: Seat;
}

export const online = {
  createRoom: (difficulty: Difficulty) => call<Joined>('create', { difficulty }),
  joinRoom: (code: string) => call<Joined>('join', { code }),
  /** Joins the oldest waiting random duel, or waits in a new one. */
  quickMatch: (difficulty: Difficulty) => call<Joined>('queue', { difficulty }),
  move: (duelId: string, cell: number, digit: number) =>
    call<{ duel: DuelRow; event: DuelEvent }>('move', { duelId, cell, digit }),
  claimTimeout: (duelId: string) => call<{ duel: DuelRow }>('timeout', { duelId }),
  leave: (duelId: string) => call<{ duel?: DuelRow }>('leave', { duelId }),
  /** Asks for a rematch: { waiting } until the rival asks too, then the new duel. */
  rematch: (duelId: string) => call<{ waiting?: true; duel?: DuelRow; seat?: Seat }>('rematch', { duelId }),
  declineRematch: (duelId: string) => call<{ declined: true }>('decline-rematch', { duelId }),
};

/**
 * Leaves a duel in the background: gives it up, or stops waiting for a rival. The screen moves on
 * at once; a request that does not get through is tried twice more.
 */
export function leaveDuel(duelId: string, attempts = 3): void {
  online.leave(duelId).catch((error: unknown) => {
    const code = error instanceof OnlineError ? error.code : 'network';
    if (attempts > 1 && ['network', 'server-error', 'conflict'].includes(code)) {
      setTimeout(() => leaveDuel(duelId, attempts - 1), 1000);
    }
  });
}

export async function fetchDuel(id: string): Promise<DuelRow> {
  const { data, error } = await supabase.from('duels').select().eq('id', id).single();
  if (error) throw new OnlineError('network');
  return data as DuelRow;
}

export async function fetchNickname(playerId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('nickname').eq('id', playerId).maybeSingle();
  return (data?.nickname as string | undefined) ?? 'Rywal';
}

/**
 * Calls `onRow` with every new version of the duel as it changes on the server, starting with
 * the current one once the live connection is up. Returns a function that stops watching.
 */
export function watchDuel(id: string, onRow: (row: DuelRow) => void): () => void {
  const channel = supabase
    .channel(`duel-${id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duels', filter: `id=eq.${id}` }, (payload) =>
      onRow(payload.new as DuelRow),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void fetchDuel(id).then(onRow, () => {});
    });
  return () => void supabase.removeChannel(channel);
}

/** Polish message for an online error code. */
export function errorMessage(error: unknown): string {
  const code = error instanceof OnlineError ? error.code : 'network';
  const messages: Record<string, string> = {
    'no-such-room': 'Nie ma pokoju o tym kodzie.',
    'own-room': 'To Twój własny pokój.',
    'room-taken': 'Ktoś już dołączył do tego pokoju.',
    'bad-code': 'Kod ma cztery cyfry.',
    'sign-in': 'Nie udało się zalogować.',
    'too-late': 'Za późno: czas tury minął.',
    'rival-left': 'Rywal wyszedł z pojedynku.',
  };
  return messages[code] ?? 'Brak połączenia z serwerem.';
}
