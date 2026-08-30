#!/usr/bin/env -S pnpm exec tsx
/**
 * API surface lock for the published packages.
 *
 *   pnpm api:check    # compare dist/*.d.ts against etc/*.api.d.ts.snapshot, exit 1 on drift
 *   pnpm api:update   # regenerate the snapshots from dist/
 *
 * tsup already rolls each entry point up into a single .d.ts, so the snapshot is
 * that rollup, byte-normalised (CRLF -> LF, exactly one trailing newline) to stay
 * deterministic across machines. Requires `pnpm build` first.
 *
 * Exit codes: 0 in sync, 1 drift detected (--check), 2 usage / missing build output.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

interface SurfaceEntry {
  /** Rolled-up declaration file produced by tsup. */
  source: string;
  /** Committed snapshot path. */
  snapshot: string;
}

const entries: SurfaceEntry[] = [
  { source: 'packages/core/dist/index.d.ts', snapshot: 'etc/core-api.d.ts.snapshot' },
  { source: 'sdks/trendyol/dist/index.d.ts', snapshot: 'etc/trendyol-api.d.ts.snapshot' },
  { source: 'sdks/trendyol/dist/testing.d.ts', snapshot: 'etc/trendyol-testing-api.d.ts.snapshot' },
  { source: 'sdks/hepsiburada/dist/index.d.ts', snapshot: 'etc/hepsiburada-api.d.ts.snapshot' },
  {
    source: 'sdks/hepsiburada/dist/testing.d.ts',
    snapshot: 'etc/hepsiburada-testing-api.d.ts.snapshot',
  },
];

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    update: { type: 'boolean', default: false },
  },
});

if (values.check === values.update) {
  console.error('Usage: api-surface.mts --check | --update');
  process.exit(2);
}

const repoRoot = process.cwd();

function normalise(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

/** Minimal line-level diff: shows which snapshot lines were removed/added. */
function printDiff(snapshot: string, current: string): void {
  const oldLines = snapshot.split('\n');
  const newLines = current.split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const removed = oldLines.filter((line) => !newSet.has(line));
  const added = newLines.filter((line) => !oldSet.has(line));
  const cap = 40;
  for (const line of removed.slice(0, cap)) console.log(`  - ${line}`);
  if (removed.length > cap) console.log(`  … ${removed.length - cap} more removed line(s)`);
  for (const line of added.slice(0, cap)) console.log(`  + ${line}`);
  if (added.length > cap) console.log(`  … ${added.length - cap} more added line(s)`);
}

let drift = 0;

for (const entry of entries) {
  const sourcePath = join(repoRoot, entry.source);
  const snapshotPath = join(repoRoot, entry.snapshot);

  if (!existsSync(sourcePath)) {
    console.error(`Missing ${entry.source} — run \`pnpm build\` first.`);
    process.exit(2);
  }

  const current = normalise(readFileSync(sourcePath, 'utf8'));

  if (values.update) {
    mkdirSync(join(repoRoot, 'etc'), { recursive: true });
    writeFileSync(snapshotPath, current);
    console.log(`updated  ${entry.snapshot}`);
    continue;
  }

  if (!existsSync(snapshotPath)) {
    console.error(`missing  ${entry.snapshot} — run \`pnpm api:update\` and commit it.`);
    drift += 1;
    continue;
  }

  const snapshot = normalise(readFileSync(snapshotPath, 'utf8'));
  if (snapshot === current) {
    console.log(`ok       ${entry.snapshot}`);
  } else {
    console.error(`changed  ${entry.snapshot} (from ${entry.source})`);
    printDiff(snapshot, current);
    drift += 1;
  }
}

if (drift > 0) {
  console.error(
    '\nAPI surface changed — regenerate with `pnpm api:update` and include the diff in your PR.',
  );
  process.exit(1);
}

if (values.check) {
  console.log('\nAPI surface: in sync.');
}
