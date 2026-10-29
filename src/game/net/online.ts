import { createClient } from '@supabase/supabase-js';
import type { Difficulty, DuelEvent, DuelState, Seat } from '../../core/index.ts';
import { profileSuffix } from '../profile.ts';
import { progress } from '../progress/store.ts';
import { randomNickname } from './nickname.ts';
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
  /** Always the current one: the player may change it between duels. */
  readonly nickname: string;
}

/** A failed online action; `code` is the server's error code, or 'network' / 'sign-in'. */
export class OnlineError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const suffix = profileSuffix;

/** The one Supabase client; account.ts and cloudSave.ts use it too. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
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

const NICKNAME_KEY = `sudoku-dragons.nickname${suffix}`;
/** The profile the server has last confirmed, as JSON. */
const SYNCED_KEY = `sudoku-dragons.profile-synced${suffix}`;

/** The player's nickname: made up on the first visit and kept on this device, so it shows before sign-in. */
export function localNickname(): string {
  let nickname = localStorage.getItem(NICKNAME_KEY);
  if (!nickname) {
    nickname = randomNickname();
    localStorage.setItem(NICKNAME_KEY, nickname);
  }
  return nickname;
}


/** Changes the nickname here at once and on the server in the background (rivals see it from their next duel). */
export function setNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
  syncProfile();
}

/** What rivals see of a player: their nickname and the skin of their dragon (null: unknown, the default). */
export interface Profile {
  nickname: string;
  dragon: string | null;
}

function localProfile(): Profile {
  return { nickname: localNickname(), dragon: progress.dragonSkin };
}

let pushing: Promise<void> = Promise.resolve();

/** Sends this player's profile unless the server already has it. One at a time, so the last change wins. */
function pushProfile(): Promise<void> {
  pushing = pushing
    .catch(() => {})
    .then(async () => {
      const profile = localProfile();
      const json = JSON.stringify(profile);
      if (localStorage.getItem(SYNCED_KEY) === json) return;
      await call('profile', { ...profile });
      localStorage.setItem(SYNCED_KEY, json);
    });
  return pushing;
}

/**
 * Tells the server about a changed profile (a new dragon skin), in the background. Before sign-in
 * there is nothing to do: signing in sends it.
 */
export function syncProfile(): void {
  void connecting?.then(pushProfile).catch(() => {});
}

let connecting: Promise<Me> | null = null;

/**
 * Signs in (anonymously, once per device) and makes sure the server knows the profile.
 * Everyone shares one attempt; after a failure the next call tries again.
 */
export function connect(): Promise<Me> {
  if (connecting) {
    // Signed in already: a profile change that did not get through goes now.
    syncProfile();
    return connecting;
  }
  connecting = signIn().catch((error: unknown) => {
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
  await pushProfile();
  return {
    id: data.session!.user.id,
    get nickname() {
      return localNickname();
    },
  };
}

/**
 * After logging in to an account or out of one: the next connect() starts from the new session and
 * sends its profile again. `nickname` replaces the one on this device (the account's, or a new
 * made-up one for the next guest).
 */
export function switchedAccount(nickname: string): void {
  connecting = null;
  localStorage.setItem(NICKNAME_KEY, nickname);
  localStorage.removeItem(SYNCED_KEY);
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

/** Profiles read this session, so a rematch shows the rival's name and dragon at once. */
const knownProfiles = new Map<string, Profile>();

export function knownProfile(playerId: string): Profile | undefined {
  return knownProfiles.get(playerId);
}

export async function fetchProfile(playerId: string): Promise<Profile> {
  const { data } = await supabase.from('profiles').select('nickname, dragon').eq('id', playerId).maybeSingle();
  if (!data) return { nickname: 'Rywal', dragon: null };
  const profile: Profile = { nickname: data.nickname as string, dragon: (data.dragon as string | undefined) ?? null };
  knownProfiles.set(playerId, profile);
  return profile;
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
