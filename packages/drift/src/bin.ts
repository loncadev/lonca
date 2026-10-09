#!/usr/bin/env -S pnpm exec tsx
// Process wrapper for `pnpm drift` (root script). All logic lives in `cli.ts`.
import { runCli } from './cli.js';

process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});
