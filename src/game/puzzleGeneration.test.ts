import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePuzzleAsync } from './puzzleGeneration.ts';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
}
beforeEach(() => { TestWorker.instances = []; vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('generation worker lifetime', () => {
  it('cancels both a queued request and an active worker, freeing the timer', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(generatePuzzleAsync(42, 'hard', 2, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(TestWorker.instances).toHaveLength(0);
    const active = new AbortController();
    const promise = generatePuzzleAsync(42, 'hard', 2, active.signal);
    const failure = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    active.abort(); await failure;
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a hung worker and allows a fresh attempt after failure', async () => {
    const pending = generatePuzzleAsync(42, 'hard');
    const failure = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(15000); await failure;
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const next = generatePuzzleAsync(42, 'hard');
    const secondFailure = expect(next).rejects.toThrow('unavailable');
    TestWorker.instances[1].onerror!(); await secondFailure;
    expect(TestWorker.instances[1].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
