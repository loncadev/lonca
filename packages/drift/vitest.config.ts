import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // `bin.ts` is the two-line process wrapper around `runCli` (exercised in-process by cli.test.ts).
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/bin.ts', 'src/__fixtures__/**'],
      // Regression floor, not a target: measured coverage rounded DOWN to the
      // nearest 5. Raise these whenever real coverage goes up; CI fails below.
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
