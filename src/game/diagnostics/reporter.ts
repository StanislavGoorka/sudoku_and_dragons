/** Strict technical vocabulary: no error messages, account data, URLs, board or request payloads. */
export type DiagnosticKind = 'runtime' | 'cloud_sync' | 'duel_request' | 'storage' | 'performance';
export type DiagnosticCode = 'unknown' | 'TypeError' | 'RangeError' | 'ReferenceError' | 'SyntaxError' |
  'network' | 'timeout' | 'storage' | 'conflict' | 'server-error' | 'sign-in' | 'chunk-load' | 'boot-ms' | 'slow-frame';
export type DiagnosticScreen = 'boot' | 'menu' | 'battle' | 'duel' | 'lobby' | 'map' | 'shop' | 'account' | 'progress';
export type DiagnosticOperation = 'boot' | 'render' | 'unhandled' | 'cloud_sync' | 'storage_write' | 'duel_read' |
  'duel_recover' | 'profile' | 'create' | 'join' | 'queue' | 'move' | 'timeout' | 'leave' | 'rematch' | 'decline-rematch';

export interface DiagnosticEvent {
  id: string;
  release: string;
  platform: 'web' | 'android' | 'ios';
  kind: DiagnosticKind;
  code: DiagnosticCode;
  screen: DiagnosticScreen;
  operation: DiagnosticOperation;
  location: string;
  count: number;
  value: number | null;
}

const CODES: readonly string[] = ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'network', 'timeout', 'storage',
  'conflict', 'server-error', 'sign-in', 'chunk-load', 'boot-ms', 'slow-frame'];
export function diagnosticCode(error: unknown): DiagnosticCode {
  try {
  if (!error || typeof error !== 'object') return 'unknown';
  const e = error as { name?: unknown; code?: unknown; message?: unknown };
  if (e.name === 'QuotaExceededError' || e.name === 'SecurityError') return 'storage';
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'timeout';
  for (const code of [e.code, e.name, e.message]) if (typeof code === 'string' && CODES.includes(code)) return code as DiagnosticCode;
  return 'unknown';
  } catch { return 'unknown'; }
}

/** Only our asset basename and line/column survive; never query strings, hosts or function arguments. */
export function diagnosticLocation(error: unknown, origin: string): string {
  const stack = error && typeof error === 'object' ? (error as { stack?: unknown }).stack : null;
  if (typeof stack !== 'string') return '';
  const frames: string[] = [];
  const framesOnly = stack.split('\n').filter((line) => /^\s*(at\s|[^\s]+@)/.test(line)).join('\n');
  for (const match of framesOnly.matchAll(/(https?:\/\/[^\s)]+):(\d{1,7}):(\d{1,9})/g)) {
    try {
      const url = new URL(match[1]);
      const file = url.pathname.split('/').at(-1) ?? '';
      if (url.origin !== origin || !/^\/(assets|src)\//.test(url.pathname) || !/^[a-zA-Z0-9_-]{1,64}\.(js|ts)$/.test(file)) continue;
      frames.push(`${file}:${match[2]}:${match[3]}`);
      if (frames.length === 3) break;
    } catch { /* Malformed stack entries are omitted. */ }
  }
  return frames.join(';');
}

export interface ReporterOptions {
  release: string;
  platform: DiagnosticEvent['platform'];
  origin: string;
  enabled: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  key: string;
  now?: () => number;
  uuid?: () => string;
}

const MAX_EVENTS = 20;
const MAX_AGE = 24 * 60 * 60 * 1000;
interface Queued { event: DiagnosticEvent; at: number }

/** Bounded, best-effort queue. Transport errors never enter this queue or affect gameplay. */
export class DiagnosticReporter {
  private queue: Queued[] = [];
  private inFlight: Queued[] = [];
  private enabled: boolean;
  private screen: DiagnosticScreen = 'boot';
  private sending = false;
  private generation = 0;
  private lastSend = -Infinity;
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(private readonly options: ReporterOptions) {
    this.enabled = options.enabled;
    this.now = options.now ?? Date.now;
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
    // Restored entries are reconstructed from allowed fields, never uploaded as arbitrary JSON.
    try {
      const stored = JSON.parse(options.storage?.getItem(options.key) ?? '[]');
      if (Array.isArray(stored)) this.queue = stored.filter((q) => this.valid(q)).slice(-MAX_EVENTS);
    } catch { /* Diagnostics must also work when storage is blocked. */ }
    if (!this.enabled) this.clear();
  }

  setScreen(screen: DiagnosticScreen): void { this.screen = screen; }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.generation++; this.clear(); }
  }

  capture(kind: DiagnosticKind, operation: DiagnosticOperation, error?: unknown, code = diagnosticCode(error), value: number | null = null): void {
    if (!this.enabled) return;
    try {
      this.expire();
      const location = diagnosticLocation(error, this.options.origin);
      const duplicate = kind === 'performance' ? undefined : this.queue.find((q) => q.event.release === this.options.release && q.event.kind === kind && q.event.operation === operation &&
        q.event.code === code && q.event.screen === this.screen && q.event.location === location);
      if (duplicate) {
        if (duplicate.event.count === 100) return;
        duplicate.event.count++;
      }
      else this.queue.push({ at: this.now(), event: {
        id: this.uuid(), release: this.options.release, platform: this.options.platform, kind, operation, code,
        screen: this.screen, location, count: 1, value: value === null ? null : Math.round(Math.max(0, Math.min(600_000, value))),
      } });
      this.queue = this.queue.slice(-(MAX_EVENTS - this.inFlight.length));
      this.persist();
    } catch { /* Even an unavailable crypto/storage API must not break the game. */ }
  }

  /** At most one small request a minute. A failed/unknown response retries immutable event IDs. */
  async flush(send: (events: DiagnosticEvent[]) => Promise<boolean>): Promise<void> {
    if (!this.enabled || this.sending || this.now() - this.lastSend < 60_000) return;
    this.expire();
    if (!this.queue.length) return;
    this.lastSend = this.now();
    this.sending = true;
    const batch = this.inFlight = this.queue.splice(0, 8);
    const generation = this.generation;
    // Persist the frozen batch too: killing the app in flight must not silently lose the report.
    try {
      const accepted = await send(batch.map((q) => ({ ...q.event })));
      if (!accepted && this.enabled && generation === this.generation) this.queue = [...batch, ...this.queue].slice(0, MAX_EVENTS);
    } catch {
      if (this.enabled && generation === this.generation) this.queue = [...batch, ...this.queue].slice(0, MAX_EVENTS);
    } finally {
      this.sending = false;
      this.inFlight = [];
      if (!this.enabled) this.clear();
      else this.persist();
    }
  }

  private valid(q: unknown): q is Queued {
    if (!q || typeof q !== 'object') return false;
    const { at, event: e } = q as Queued;
    return typeof at === 'number' && this.now() - at < MAX_AGE && this.now() >= at && Boolean(e) &&
      /^[0-9a-f-]{36}$/.test(e.id) && typeof e.release === 'string' && /^[a-zA-Z0-9_.+-]{1,64}$/.test(e.release) && e.platform === this.options.platform &&
      ['runtime', 'cloud_sync', 'duel_request', 'storage', 'performance'].includes(e.kind) &&
      ['unknown', ...CODES].includes(e.code) &&
      ['boot', 'menu', 'battle', 'duel', 'lobby', 'map', 'shop', 'account', 'progress'].includes(e.screen) &&
      ['boot', 'render', 'unhandled', 'cloud_sync', 'storage_write', 'duel_read', 'duel_recover', 'profile', 'create', 'join', 'queue', 'move', 'timeout', 'leave', 'rematch', 'decline-rematch'].includes(e.operation) &&
      typeof e.location === 'string' && /^(?:[a-zA-Z0-9_-]{1,64}\.(?:js|ts):\d{1,7}:\d{1,9}(?:;|$)){0,3}$/.test(e.location) &&
      Number.isInteger(e.count) && e.count >= 1 && e.count <= 100 &&
      (e.value === null || Number.isInteger(e.value) && e.value >= 0 && e.value <= 600_000) &&
      Object.keys(e).every((key) => ['id', 'release', 'platform', 'kind', 'code', 'screen', 'operation', 'location', 'count', 'value'].includes(key));
  }

  private expire(): void { this.queue = this.queue.filter((q) => this.now() - q.at < MAX_AGE); }
  private clear(): void {
    this.queue = [];
    this.inFlight = [];
    try { this.options.storage?.removeItem(this.options.key); } catch { /* Best effort. */ }
  }
  private persist(): void {
    try { this.options.storage?.setItem(this.options.key, JSON.stringify([...this.inFlight, ...this.queue].slice(0, MAX_EVENTS))); } catch { /* Memory only. */ }
  }
}
