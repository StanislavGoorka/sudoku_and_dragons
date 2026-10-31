import type { DailyMove, Difficulty } from '../../core/index.ts';
import { connect, OnlineError, supabase } from './online.ts';
import { profileSuffix } from '../profile.ts';

export interface RankedRun { id: string; user_id: string; day: string; difficulty: Difficulty; seed: number; started_at: string }
export interface DailyRanking { day: string; difficulty: Difficulty; players: number;
  top: { place: number; nickname: string; elapsed_ms: number; mine: boolean }[];
  own: { place: number; elapsed_ms: number } | null }
const KEY = `sudoku-dragons.daily-pending${profileSuffix}`;
interface Pending { run: RankedRun; moves: DailyMove[] }
function pending(): Pending[] {
  try { const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(rows) ? rows.filter((r) => r?.run?.id && Array.isArray(r.moves) && r.moves.length <= 1000 &&
      Date.now() - Date.parse(r.run.started_at) < 86400000).slice(-5) : [];
  } catch { return []; }
}
function store(rows: Pending[]): void { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* Play remains local. */ } }
export function clearDailyResults(): void { try { localStorage.removeItem(KEY); } catch { /* Storage is unavailable. */ } }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('daily', { body, timeout: 10_000 });
  if (error) {
    let code = 'network';
    try { code = (await error.context?.json())?.error ?? code; } catch { /* Transport error. */ }
    throw new OnlineError(code);
  }
  return data as T;
}
export async function beginDaily(difficulty: Difficulty): Promise<RankedRun> {
  await connect();
  return (await call<{ run: RankedRun }>({ action: 'start', difficulty })).run;
}
export async function dailyRanking(difficulty: Difficulty): Promise<DailyRanking> {
  await connect();
  const { data, error } = await supabase.rpc('daily_leaderboard', { level: difficulty }).abortSignal(AbortSignal.timeout(10_000));
  if (error) throw new OnlineError('network');
  return data as DailyRanking;
}
export function queueDailyResult(run: RankedRun, moves: DailyMove[]): void {
  store([...pending().filter((p) => p.run.id !== run.id), { run, moves }].slice(-5));
}
let flushing: Promise<void> | undefined;
export function flushDailyResults(): Promise<void> {
  return flushing ??= (async () => {
    const user = (await supabase.auth.getSession()).data.session?.user.id;
    if (!user) return;
    for (const entry of pending().filter((p) => p.run.user_id === user)) {
      if ((await supabase.auth.getSession()).data.session?.user.id !== user) return;
      try {
        await call({ action: 'finish', runId: entry.run.id, moves: entry.moves });
      } catch (error) {
        if (!(error instanceof OnlineError) || !['expired', 'invalid-replay', 'not-found'].includes(error.code)) throw error;
      }
      if ((await supabase.auth.getSession()).data.session?.user.id !== user) return;
      store(pending().filter((p) => p.run.id !== entry.run.id));
    }
  })().finally(() => { flushing = undefined; });
}
window.addEventListener('online', () => { void flushDailyResults().catch(() => {}); });
