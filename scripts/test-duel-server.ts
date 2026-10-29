// End-to-end check of the deployed `duel` Edge Function with two fresh anonymous players:
// room by code, random matchmaking, correct and wrong moves, moving out of turn, forfeiting.
// The test players find correct digits the way a player would: by solving the board (core solver).
// Usage: node scripts/test-duel-server.ts
import { solve, type DuelEvent, type DuelState } from '../src/core/index.ts';
import { SUPABASE_KEY, SUPABASE_URL } from '../src/game/net/config.ts';

interface Duel {
  id: string;
  code: string | null;
  status: string;
  player0: string;
  player1: string | null;
  state: DuelState;
  version: number;
}
interface Player {
  name: string;
  id: string;
  token: string;
}

async function signUp(name: string): Promise<Player> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`sign-up failed: ${JSON.stringify(body)}`);
  return { name, id: body.user.id, token: body.access_token };
}

async function call(player: Player, action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/duel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${player.token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  return { status: res.status, body: await res.json() };
}

let failures = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const a = await signUp('A');
const b = await signUp('B');
check('two anonymous players signed up', Boolean(a.token && b.token));
check('profile', (await call(a, 'profile', { nickname: 'Tester A' })).body.nickname === 'Tester A');
await call(b, 'profile', { nickname: 'Tester B' });

// Room by code.
const created = await call(a, 'create', { difficulty: 'easy' });
const room: Duel = created.body.duel;
check('room created with a 4-digit code', created.status === 200 && /^[1-9]{4}$/.test(room.code ?? ''), created.body);
check('the board is sent, the solution is not', !('solution' in created.body) && room.state.board.length === 81);
check('own room cannot be joined', (await call(a, 'join', { code: room.code })).body.error === 'own-room');
check('unknown code is refused', (await call(b, 'join', { code: '1111' === room.code ? '2222' : '1111' })).status === 404);
const joined = await call(b, 'join', { code: room.code });
let duel: Duel = joined.body.duel;
check('second player joins, duel starts', joined.status === 200 && duel.status === 'playing', joined.body);

const solution = solve(duel.state.board)!;
const players = [a, b];
const onTurn = () => players[duel.state.turn];
const offTurn = () => players[1 - duel.state.turn];
const emptyCell = () => duel.state.board.findIndex((v) => v === 0);

const outOfTurn = await call(offTurn(), 'move', { duelId: duel.id, cell: emptyCell(), digit: solution[emptyCell()] });
check('moving out of turn is refused', outOfTurn.body.error === 'not-your-turn', outOfTurn.body);

let cell = emptyCell();
const hpBefore = [...duel.state.hp];
const mover = duel.state.turn;
let result = await call(onTurn(), 'move', { duelId: duel.id, cell, digit: solution[cell] });
duel = result.body.duel;
const event: DuelEvent = result.body.event;
check('correct digit is accepted', result.status === 200 && event.kind === 'correct', result.body);
check('it damages the other player', duel.state.hp[1 - mover] < hpBefore[1 - mover] && duel.state.hp[mover] === hpBefore[mover]);
check('it is written to the shared board', duel.state.board[cell] === solution[cell]);

const occupied = await call(onTurn(), 'move', { duelId: duel.id, cell, digit: solution[cell] });
check('a filled cell is refused', occupied.body.error === 'occupied', occupied.body);

cell = emptyCell();
const wrongMover = duel.state.turn;
result = await call(onTurn(), 'move', { duelId: duel.id, cell, digit: (solution[cell] % 9) + 1 });
duel = result.body.duel;
check('wrong digit costs its player HP and ends the turn', result.body.event?.kind === 'wrong' && duel.state.turn !== wrongMover, result.body);
check('wrong digit is not written', duel.state.board[cell] === 0);

check('timeout before the deadline is refused', (await call(a, 'timeout', { duelId: duel.id })).body.error === 'not-yet');

const left = await call(a, 'leave', { duelId: duel.id });
check('leaving forfeits: the other player wins', left.body.duel?.state.winner === 1 && left.body.duel?.status === 'finished', left.body);
check('no moves after the end', (await call(b, 'move', { duelId: duel.id, cell: emptyCell(), digit: 1 })).status === 409);
check('no rematch with a player who gave up', (await call(b, 'rematch', { duelId: duel.id })).body.error === 'rival-left');

// Rematch: play a duel to a knockout, then both ask.
async function playToKnockout(start: Duel): Promise<Duel> {
  let current = start;
  const answer = solve(current.state.board)!;
  while (!current.state.finished) {
    const cell = current.state.board.findIndex((v) => v === 0);
    const result = await call(players[current.state.turn], 'move', { duelId: current.id, cell, digit: answer[cell] });
    if (result.status !== 200) throw new Error(`move failed: ${JSON.stringify(result.body)}`);
    current = result.body.duel;
  }
  return current;
}
const roomForRematch = await call(a, 'create', { difficulty: 'easy' });
const fought = await playToKnockout((await call(b, 'join', { code: roomForRematch.body.duel.code })).body.duel);
check('a duel can be played to the end', fought.state.finished && fought.state.winner !== null);
const asked = await call(a, 'rematch', { duelId: fought.id });
check('the first to ask for a rematch waits', asked.body.waiting === true, asked.body);
check('asking twice still waits', (await call(a, 'rematch', { duelId: fought.id })).body.waiting === true);
const accepted = await call(b, 'rematch', { duelId: fought.id });
const next: Duel = accepted.body.duel;
check(
  'when both ask, a new duel starts with the same players in the same seats',
  next?.status === 'playing' && next.id !== fought.id && next.player0 === fought.player0 && next.player1 === fought.player1 && accepted.body.seat === 1,
  accepted.body,
);
check('the new duel has a fresh board', next?.state.board.join('') !== fought.state.board.join(''));
check('no rematch before the duel ends', (await call(a, 'rematch', { duelId: next.id })).body.error === 'not-finished');
const late = await call(a, 'rematch', { duelId: fought.id });
check('the first player gets the same new duel', late.body.duel?.id === next.id && late.body.seat === 0, late.body);

// Declining: the rival leaves the end screen without answering.
const fought2 = await playToKnockout(next);
await call(b, 'rematch', { duelId: fought2.id });
await call(a, 'decline-rematch', { duelId: fought2.id });
check('a declined rematch is refused', (await call(b, 'rematch', { duelId: fought2.id })).body.error === 'rival-left');

// Random matchmaking.
const waiting = await call(a, 'queue', { difficulty: 'medium' });
check('first in the queue waits', waiting.body.duel?.status === 'waiting' && waiting.body.seat === 0, waiting.body);
const matched = await call(b, 'queue', { difficulty: 'medium' });
check(
  'second in the queue is matched into the same duel',
  matched.body.duel?.id === waiting.body.duel?.id && matched.body.duel?.status === 'playing' && matched.body.seat === 1,
  matched.body,
);
await call(b, 'leave', { duelId: matched.body.duel.id });

// A waiting room can be cancelled.
const lonely = await call(a, 'create', { difficulty: 'hard' });
check('a waiting room can be cancelled', (await call(a, 'leave', { duelId: lonely.body.duel.id })).body.cancelled === true);

// What a player can read straight from the database with their session (row-level security).
async function select(player: Player, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { Authorization: `Bearer ${player.token}`, apikey: SUPABASE_KEY },
  });
  return { status: res.status, rows: (await res.json()) as unknown[] };
}
const secrets = await select(a, 'duel_secrets?select=*');
check('players cannot read any solution', Array.isArray(secrets.rows) && secrets.rows.length === 0, secrets);
const outsider = await signUp('C');
const peek = await select(outsider, `duels?id=eq.${duel.id}&select=id`);
check("players cannot read other players' duels", peek.rows.length === 0, peek);
const own = await select(a, `duels?id=eq.${duel.id}&select=id`);
check('players can read their own duels', own.rows.length === 1, own);
const write = await fetch(`${SUPABASE_URL}/rest/v1/duels?id=eq.${duel.id}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${a.token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ status: 'playing' }),
});
check('players cannot change a duel directly', ((await write.json()) as unknown[]).length === 0);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
