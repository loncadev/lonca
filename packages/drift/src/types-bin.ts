#!/usr/bin/env -S pnpm exec tsx
// Process wrapper for `pnpm drift:types` (root script). All logic lives in `types-cli.ts`.
import { runTypesCli } from './types-cli.js';

process.exitCode = runTypesCli(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});
