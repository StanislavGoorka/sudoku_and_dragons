import { describe, expect, it, vi } from 'vitest';
import { DiagnosticReporter, diagnosticCode, diagnosticLocation, type DiagnosticEvent } from './reporter.ts';

function setup(enabled = true) {
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
  let now = 1000;
  let id = 0;
  const options = { enabled, storage, key: 'diagnostics', release: 'abc123', platform: 'web' as const,
    origin: 'https://game.test', now: () => now, uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` };
  return { reporter: new DiagnosticReporter(options), options, memory, advance: (ms = 60_000) => { now += ms; } };
}

describe('private technical reports', () => {
  it('drops error messages, URLs, query strings and foreign stack frames', async () => {
    const { reporter } = setup();
    const error = new TypeError('secret@example.com password=never-send');
    error.stack = 'TypeError: secret@example.com\n at f (https://game.test/assets/main-HASH.js?token=secret:12:456)\n' +
      ' at other (https://elsewhere.test/private.js:1:4)';
    expect(diagnosticLocation(error, 'https://game.test')).toBe('main-HASH.js:12:456');
    reporter.capture('runtime', 'unhandled', error);
    const send = vi.fn().mockResolvedValue(true);
    await reporter.flush(send);
    const payload = JSON.stringify(send.mock.calls);
    expect(payload).toContain('TypeError');
    expect(payload).not.toMatch(/secret|password|token|https|elsewhere/);
    expect(diagnosticCode(new Error('some body with personal data'))).toBe('unknown');
  });

  it('groups duplicate failures, caps repeats, and never exceeds 20 queued records', async () => {
    const { reporter, memory } = setup();
    for (let i = 0; i < 200; i++) reporter.capture('cloud_sync', 'cloud_sync', new Error('network'));
    expect(JSON.parse(memory.get('diagnostics')!)).toHaveLength(1);
    expect(JSON.parse(memory.get('diagnostics')!)[0].event.count).toBe(100);
    for (let i = 0; i < 30; i++) {
      const error = new Error(); error.stack = `at x (https://game.test/assets/main.js:1:${i})`;
      reporter.capture('runtime', 'unhandled', error);
    }
    expect(JSON.parse(memory.get('diagnostics')!)).toHaveLength(20);
  });

  it('retries the same immutable IDs after a response was lost, with no recursive error capture', async () => {
    const { reporter, advance } = setup();
    reporter.capture('duel_request', 'move', new Error('network'));
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    await reporter.flush(send);
    await reporter.flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    advance(); await reporter.flush(send);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    advance(); await reporter.flush(send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps an in-flight batch durable while new errors arrive and survive a restart', async () => {
    const { reporter, options } = setup();
    reporter.capture('runtime', 'unhandled', new TypeError());
    let finish!: (value: boolean) => void;
    const flushing = reporter.flush(() => new Promise((resolve) => { finish = resolve; }));
    reporter.capture('cloud_sync', 'cloud_sync', new Error('network'));
    const restarted = new DiagnosticReporter(options);
    const send = vi.fn().mockResolvedValue(true);
    await restarted.flush(send);
    expect(send.mock.calls[0][0]).toHaveLength(2);
    finish(true); await flushing;
  });

  it('opt-out removes queued reports and prevents new ones, including while a request is in flight', async () => {
    const { reporter, memory, advance } = setup();
    reporter.capture('runtime', 'boot');
    let finish!: (value: boolean) => void;
    const flushing = reporter.flush(() => new Promise((resolve) => { finish = resolve; }));
    reporter.setEnabled(false);
    finish(false); await flushing;
    reporter.capture('runtime', 'boot');
    advance();
    const send = vi.fn(); await reporter.flush(send);
    expect(send).not.toHaveBeenCalled();
    expect(memory.size).toBe(0);
  });

  it('expires old entries but can send a previous release\'s crash after an update', async () => {
    const { reporter, options, advance } = setup();
    reporter.capture('runtime', 'boot');
    const updated = new DiagnosticReporter({ ...options, release: 'new-release' });
    const send = vi.fn().mockResolvedValue(true); await updated.flush(send);
    expect((send.mock.calls[0][0] as DiagnosticEvent[])[0].release).toBe('abc123');
    reporter.capture('runtime', 'boot'); advance(25 * 3600_000);
    const expired = new DiagnosticReporter(options);
    const emptySend = vi.fn(); await expired.flush(emptySend);
    expect(emptySend).not.toHaveBeenCalled();
  });

  it('does not upload tampered storage fields or let storage failures break gameplay', async () => {
    const { reporter, options, memory } = setup();
    reporter.capture('runtime', 'boot');
    const saved = JSON.parse(memory.get('diagnostics')!);
    saved[0].event.message = 'private data';
    memory.set('diagnostics', JSON.stringify(saved));
    const tampered = new DiagnosticReporter(options);
    const send = vi.fn(); await tampered.flush(send); expect(send).not.toHaveBeenCalled();
    const blocked = new DiagnosticReporter({ ...options, storage: {
      getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); }, removeItem: () => { throw new Error(); },
    } });
    expect(() => blocked.capture('runtime', 'boot')).not.toThrow();
  });
});
