// The duel referee. Every change to a duel goes through here: the function holds the board's
// solution (table duel_secrets, unreadable by clients) and judges moves with src/core.
// `core/` next to this file is a copy of src/core made by `npm run function:bundle`.
//
// POST { action, ... } with the player's Supabase session as Bearer token:
//   profile {nickname, dragon?, effect?} | create {difficulty} | join {code} | queue {difficulty}
//   move {duelId, cell, digit} | timeout {duelId} | leave {duelId}
//   rematch {duelId} | decline-rematch {duelId}   (after a finished duel)
// Responses are JSON; failures are { error: <code> } with a 4xx/5xx status.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  createDuel,
  DUEL_RULES,
  forfeit,
  generatePuzzle,
  playDuelMove,
  timeoutTurn,
  type Difficulty,
  type DuelEvent,
  type DuelState,
  type Seat,
} from './core/index.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
/** Extra seconds past the turn deadline for network delay. */
const GRACE_SECONDS = 3;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

interface DuelRow {
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
  /** Seat that asked for a rematch first. */
  rematch_by: Seat | null;
  rematch_declined: boolean;
  /** The rematch duel, once both players asked. */
  next_duel: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    // Checks the token's signature against the project's cached signing keys: no round trip to Auth.
    const { data, error } = await admin.auth.getClaims(token);
    const uid = data?.claims.sub;
    if (error || !uid) throw new HttpError(401, 'not-signed-in');
    const body = await req.json().catch(() => ({}));
    const result = await handle(uid, body);
    // serverTime lets clients correct their clock for the turn countdown.
    return json({ ...result, serverTime: Date.now() });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'server-error' }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function handle(uid: string, body: any): Promise<Record<string, unknown>> {
  switch (body?.action) {
    case 'profile':
      return setProfile(uid, String(body.nickname ?? ''), optional(body.dragon), optional(body.effect));
    case 'create':
      return createRoom(uid, difficultyOf(body.difficulty));
    case 'join':
      return joinRoom(uid, String(body.code ?? ''));
    case 'queue':
      return queue(uid, difficultyOf(body.difficulty));
    case 'move':
      return move(uid, String(body.duelId), Number(body.cell), Number(body.digit));
    case 'timeout':
      return claimTimeout(uid, String(body.duelId));
    case 'leave':
      return leave(uid, String(body.duelId));
    case 'rematch':
      return rematch(uid, String(body.duelId));
    case 'decline-rematch':
      return declineRematch(uid, String(body.duelId));
    default:
      throw new HttpError(400, 'unknown-action');
  }
}

function optional(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

function difficultyOf(value: unknown): Difficulty {
  const difficulty = DIFFICULTIES.find((d) => d === value);
  if (!difficulty) throw new HttpError(400, 'bad-difficulty');
  return difficulty;
}

function randomInt(maxExclusive: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % maxExclusive;
}

const COSMETIC_ID = /^[a-z0-9-]{1,24}$/;

/**
 * `dragon` and `effect` are the ids of the player's dragon skin and hit effect; any well-formed id, so
 * new cosmetics need no redeploy. One left out (by an app older than it) keeps the stored one.
 */
async function setProfile(uid: string, nickname: string, dragon?: string, effect?: string) {
  const name = nickname.trim().slice(0, 24);
  if (name.length < 2) throw new HttpError(400, 'bad-nickname');
  if (dragon !== undefined && !COSMETIC_ID.test(dragon)) throw new HttpError(400, 'bad-dragon');
  if (effect !== undefined && !COSMETIC_ID.test(effect)) throw new HttpError(400, 'bad-effect');
  const { error } = await admin
    .from('profiles')
    .upsert({ id: uid, nickname: name, ...(dragon === undefined ? {} : { dragon }), ...(effect === undefined ? {} : { effect }) });
  if (error) throw error;
  return { nickname: name, dragon, effect };
}

/**
 * A duel with a fresh secret board: waiting for a second player, unless `extra` already seats one.
 * `code` is null for random matchmaking and rematches.
 */
async function newDuel(
  uid: string,
  mode: 'room' | 'random',
  difficulty: Difficulty,
  code: string | null,
  extra: Record<string, unknown> = {},
) {
  const seed = randomInt(2 ** 32);
  const puzzle = generatePuzzle(seed, difficulty);
  const firstTurn: Seat = randomInt(2) === 0 ? 0 : 1;
  const { data, error } = await admin
    .from('duels')
    .insert({ mode, code, difficulty, player0: uid, state: createDuel(puzzle.givens, firstTurn), ...extra })
    .select()
    .single();
  if (error) throw error;
  const secret = await admin.from('duel_secrets').insert({ duel_id: data.id, seed, solution: puzzle.solution });
  if (secret.error) throw secret.error;
  return data as DuelRow;
}

/** One waiting duel per player: starting a new search cancels the old one. Stale rooms are cleared too. */
async function cancelWaiting(uid: string) {
  await admin.from('duels').update({ status: 'cancelled' }).eq('status', 'waiting').eq('player0', uid);
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  await admin.from('duels').update({ status: 'cancelled' }).eq('status', 'waiting').lt('created_at', stale);
}

async function createRoom(uid: string, difficulty: Difficulty) {
  await cancelWaiting(uid);
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = Array.from({ length: 4 }, () => 1 + randomInt(9)).join('');
    try {
      const duel = await newDuel(uid, 'room', difficulty, code);
      return { duel, seat: 0 };
    } catch (e) {
      // 23505: the code is taken by another waiting room; try another.
      if ((e as { code?: string }).code !== '23505') throw e;
    }
  }
  throw new HttpError(503, 'no-free-code');
}

async function joinRoom(uid: string, code: string) {
  if (!/^[1-9]{4}$/.test(code)) throw new HttpError(400, 'bad-code');
  const { data: room } = await admin
    .from('duels')
    .select()
    .eq('status', 'waiting')
    .eq('mode', 'room')
    .eq('code', code)
    .maybeSingle();
  if (!room) throw new HttpError(404, 'no-such-room');
  if (room.player0 === uid) throw new HttpError(400, 'own-room');
  const { data, error } = await admin
    .from('duels')
    .update({
      player1: uid,
      status: 'playing',
      turn_started_at: new Date().toISOString(),
      version: room.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .eq('status', 'waiting')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, 'room-taken');
  return { duel: data, seat: 1 };
}

async function queue(uid: string, difficulty: Difficulty) {
  await cancelWaiting(uid);
  const { data: claimed, error } = await admin.rpc('claim_random_duel', { p_player: uid, p_difficulty: difficulty });
  if (error) throw error;
  if (claimed) return { duel: await loadDuel(claimed as string), seat: 1 };
  return { duel: await newDuel(uid, 'random', difficulty, null), seat: 0 };
}

async function loadDuel(id: string): Promise<DuelRow> {
  const { data, error } = await admin.from('duels').select().eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'no-such-duel');
  return data as DuelRow;
}

function seatOf(duel: DuelRow, uid: string): Seat {
  if (duel.player0 === uid) return 0;
  if (duel.player1 === uid) return 1;
  throw new HttpError(403, 'not-your-duel');
}

function turnExpired(duel: DuelRow, graceSeconds: number): boolean {
  if (!duel.turn_started_at) return false;
  const deadline = Date.parse(duel.turn_started_at) + (DUEL_RULES.turnSeconds + graceSeconds) * 1000;
  return Date.now() > deadline;
}

/** Changes `fields` if nobody changed the duel since it was read. Returns false otherwise. */
async function bump(duel: DuelRow, fields: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await admin
    .from('duels')
    .update({ ...fields, version: duel.version + 1, updated_at: new Date().toISOString() })
    .eq('id', duel.id)
    .eq('version', duel.version)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Writes a new state if nobody changed the duel since it was read; otherwise 409. */
async function save(
  duel: DuelRow,
  state: DuelState,
  event: DuelEvent,
  turnStartedAt: string | null,
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await admin
    .from('duels')
    .update({
      state,
      last_event: event,
      status: state.finished ? 'finished' : 'playing',
      version: duel.version + 1,
      turn_started_at: turnStartedAt,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', duel.id)
    .eq('version', duel.version)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, 'conflict');
  return data as DuelRow;
}

async function move(uid: string, duelId: string, cell: number, digit: number) {
  // The duel and its solution in one query.
  const { data, error } = await admin.from('duels').select('*, duel_secrets(solution)').eq('id', duelId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'no-such-duel');
  const { duel_secrets: secret, ...duel } = data as DuelRow & { duel_secrets: { solution: number[] } };
  const seat = seatOf(duel, uid);
  if (duel.status !== 'playing') throw new HttpError(409, 'not-playing');
  if (turnExpired(duel, GRACE_SECONDS)) throw new HttpError(409, 'too-late');

  const state = duel.state;
  const turnBefore = state.turn;
  const result = playDuelMove(state, secret.solution, seat, cell, digit);
  if (!result.ok) throw new HttpError(409, result.error);
  const turnStartedAt = state.turn !== turnBefore ? new Date().toISOString() : duel.turn_started_at;
  const saved = await save(duel, state, result.event, turnStartedAt);
  return { duel: saved, event: result.event };
}

async function claimTimeout(uid: string, duelId: string) {
  const duel = await loadDuel(duelId);
  seatOf(duel, uid);
  if (duel.status !== 'playing') throw new HttpError(409, 'not-playing');
  if (!turnExpired(duel, 0)) throw new HttpError(409, 'not-yet');
  const event = timeoutTurn(duel.state);
  if (!event) throw new HttpError(409, 'not-playing');
  // Clients show the next turn from the deadline on, before anyone claims it, so it starts there
  // (unless the claim comes so late that the deadline is long gone).
  const deadline = Date.parse(duel.turn_started_at!) + DUEL_RULES.turnSeconds * 1000;
  const startsAt = Date.now() - deadline < GRACE_SECONDS * 1000 ? deadline : Date.now();
  return { duel: await save(duel, duel.state, event, new Date(startsAt).toISOString()), event };
}

async function leave(uid: string, duelId: string) {
  // Retries when a move or a timeout claim changes the duel between reading and writing it.
  for (let attempt = 0; attempt < 3; attempt++) {
    const duel = await loadDuel(duelId);
    const seat = seatOf(duel, uid);
    if (duel.status === 'waiting') {
      await admin.from('duels').update({ status: 'cancelled' }).eq('id', duelId).eq('status', 'waiting');
      return { cancelled: true };
    }
    if (duel.status !== 'playing') return { cancelled: false };
    const event = forfeit(duel.state, seat);
    if (!event) return { cancelled: false };
    try {
      // Whoever gives up does not want a rematch either.
      return { duel: await save(duel, duel.state, event, duel.turn_started_at, { rematch_declined: true }), event };
    } catch (e) {
      if (!(e instanceof HttpError && e.message === 'conflict')) throw e;
    }
  }
  throw new HttpError(409, 'conflict');
}

/**
 * After a finished duel. The first player to ask waits ({ waiting: true }); when the other asks too,
 * a new duel with the same players and difficulty starts and both get it ({ duel, seat }).
 */
async function rematch(uid: string, duelId: string) {
  // Retries when both players ask at the same moment and one write loses the race.
  for (let attempt = 0; attempt < 3; attempt++) {
    const duel = await loadDuel(duelId);
    const seat = seatOf(duel, uid);
    if (duel.status !== 'finished') throw new HttpError(409, 'not-finished');
    if (duel.next_duel) return { duel: await loadDuel(duel.next_duel), seat };
    if (duel.rematch_declined) throw new HttpError(409, 'rival-left');
    if (duel.rematch_by === seat) return { waiting: true };
    if (duel.rematch_by === null) {
      if (await bump(duel, { rematch_by: seat })) return { waiting: true };
      continue;
    }

    // The rival asked first: start the rematch, keeping both players in their seats.
    const next = await newDuel(duel.player0, duel.mode, duel.difficulty, null, {
      player1: duel.player1,
      status: 'playing',
      turn_started_at: new Date().toISOString(),
    });
    if (await bump(duel, { next_duel: next.id })) return { duel: next, seat };
    await admin.from('duels').delete().eq('id', next.id);
  }
  throw new HttpError(409, 'conflict');
}

/** A player left the end screen: the rival's rematch request will not be answered. */
async function declineRematch(uid: string, duelId: string) {
  const duel = await loadDuel(duelId);
  seatOf(duel, uid);
  if (duel.status === 'finished' && !duel.next_duel && !duel.rematch_declined) {
    await bump(duel, { rematch_declined: true });
  }
  return { declined: true };
}
