import { generatePuzzle, type Difficulty, type GeneratorVersion } from '../core/sudoku/generator.ts';

self.onmessage = (event: MessageEvent<{ seed: number; difficulty: Difficulty; version: GeneratorVersion }>) => {
  try {
    const { seed, difficulty, version } = event.data;
    self.postMessage({ puzzle: generatePuzzle(seed, difficulty, version) });
  } catch {
    self.postMessage({ error: 'Puzzle generation failed' });
  }
};
