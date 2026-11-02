// Reproducible generator audit. Timing is informational; correctness is a hard failure.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { analyzePuzzle, countSolutions, generatePuzzle, type Difficulty } from '../src/core/index.ts';

const samples = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(samples) || samples < 1 || samples > 10000) throw new Error('Choose 1–10000 samples');
const report = [];
for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
  const timings: number[] = [], boards = new Set<string>(), clues: Record<number, number> = {};
  let fallbacks = 0, totalAttempts = 0;
  for (let seed = 0; seed < samples; seed++) {
    const started = performance.now();
    const puzzle = generatePuzzle(seed, difficulty, 2);
    timings.push(performance.now() - started);
    const analysis = analyzePuzzle(puzzle.givens);
    assert.equal(countSolutions(puzzle.givens), 1, `${difficulty}/${seed}: uniqueness`);
    assert.equal(analysis.difficulty, difficulty, `${difficulty}/${seed}: logical tier`);
    assert.deepEqual(analysis.grid, puzzle.solution, `${difficulty}/${seed}: solution`);
    boards.add(puzzle.givens.join(''));
    const n = puzzle.givens.filter(Boolean).length; clues[n] = (clues[n] ?? 0) + 1;
    fallbacks += Number(puzzle.generation!.fallback); totalAttempts += puzzle.generation!.attempts;
  }
  timings.sort((a, b) => a - b);
  const ms = (q: number) => Math.round(timings[Math.floor((timings.length - 1) * q)] * 100) / 100;
  report.push({ difficulty, samples, distinctBoards: boards.size, fallbacks, clues,
    meanAttempts: Math.round(totalAttempts / samples * 100) / 100,
    generationMs: { median: ms(.5), p95: ms(.95), max: ms(1) } });
}
console.log(JSON.stringify({ generatorVersion: 2, node: process.version, report }, null, 2));
