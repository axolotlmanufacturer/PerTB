import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Playwright owns e2e; vitest must not try to run those specs.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    // Phase 0 ships a near-empty suite by design (ticket 0.4).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      // Phase 1 gate: normalize.ts and pricing.ts above 90%. Thresholds are
      // added when those files exist; enforcing them against an empty
      // `src/lib` would fail the build for the wrong reason.
    },
  },
});
