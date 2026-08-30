import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Regression floor, not a target: measured coverage rounded DOWN to the
      // nearest 5. Raise these whenever real coverage goes up; CI fails below.
      // (`transport.ts` is only exercised indirectly through the SDK suites,
      // which is why the core floor is lower than the SDKs'.)
      thresholds: {
        lines: 70,
        functions: 80,
        branches: 60,
        statements: 65,
      },
    },
  },
});
