import { CURRENT_GENERATOR_VERSION, type Difficulty, type GeneratorVersion, type Puzzle } from '../core/sudoku/generator.ts';

/** A dedicated worker per request: generation and uniqueness search never hold up touches or painting. */
export function generatePuzzleAsync(seed: number, difficulty: Difficulty, version: GeneratorVersion = CURRENT_GENERATOR_VERSION, signal?: AbortSignal): Promise<Puzzle> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./puzzleGeneration.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { finish(); reject(new Error('Puzzle generation timeout')); }, 15_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ puzzle?: Puzzle; error?: string }>) => {
      finish();
      if (event.data.puzzle) resolve(event.data.puzzle);
      else reject(new Error('Puzzle generation failed'));
    };
    worker.onerror = () => { finish(); reject(new Error('Puzzle worker unavailable')); };
    worker.onmessageerror = () => { finish(); reject(new Error('Puzzle worker response invalid')); };
    worker.postMessage({ seed, difficulty, version });
  });
}
