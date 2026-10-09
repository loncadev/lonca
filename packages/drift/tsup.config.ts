import { defineConfig } from 'tsup';

// Private workspace package: built only so `scripts/probe` (run by tsx against
// workspace `dist/`, like the SDKs) can import the wire recorder. ESM only.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'node22',
});
