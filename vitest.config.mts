import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig says jsx: "preserve" because Next does its own transform. Vitest
  // has no such downstream step, so its own transformer (oxc, under Vite 8)
  // has to be told to compile JSX or test/unit/drive-table.test.tsx will not
  // parse.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // .tsx too: the table is a server component and the only way to prove its
    // markup is to render it (test/unit/drive-table.test.tsx).
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts'],
    // Playwright owns e2e; vitest must not try to run those specs.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    // Phase 0 ships a near-empty suite by design (ticket 0.4).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      // Phase 1 gate. The correctness layer and the one $/TB definition are
      // where a wrong number would come from, so they are held to a floor
      // that CI enforces rather than a number someone checks by eye.
      thresholds: {
        'src/lib/normalize.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        'src/lib/pricing.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
