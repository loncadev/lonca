import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // `bin.ts` / `types-bin.ts` are the process wrappers around `runCli` / `runTypesCli` (exercised in-process by the CLI tests).
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/bin.ts',
        'src/types-bin.ts',
        'src/__fixtures__/**',
      ],
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
