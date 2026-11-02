import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // The logical-rating corpus is CPU-heavy. Do not spawn a worker per file and compete for memory.
    maxWorkers: 2,
  },
});
