/**
 * `pnpm drift:types` — compare the SDKs' TypeScript response types with `specs/`.
 *
 *   pnpm drift:types                        # all mapped types, report only (exit 0)
 *   pnpm drift:types --fail-on warning      # exit 1 when there are warnings
 *   pnpm drift:types --only hepsiburada     # one marketplace (repeatable)
 *
 * Flags
 *   --fail-on warning|never                 exit 1 threshold (default: never — warn-only)
 *   --only <marketplace>                    restrict to one marketplace (repeatable)
 *   --map <file>                            type map (default: packages/drift/sdk-type-map.json)
 *   --root <dir>                            where map `source` paths resolve (default: cwd)
 *   --out-dir <dir>                         where types-report.md / .json go (default: drift-output/)
 *   --snapshots-dir <dir>                   wire baseline (default: probe-snapshots/)
 *   --specs-dir <dir>                       OpenAPI collection (default: specs/)
 *   --known <file> | --no-known             known-discrepancy overlay (default:
 *                                           <snapshots-dir>/known-discrepancies.json, optional)
 *
 * Exit codes: 0 report written (no warning, or --fail-on never), 1 warnings
 * with --fail-on warning, 2 usage / input error (invalid map or overlay, a
 * map entry that does not resolve).
 *
 * Reads committed files only: no network, no credentials, no SDK import.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CliIo } from './cli.js';
import {
  KNOWN_DISCREPANCIES_FILE,
  loadKnownDiscrepancies,
  type KnownDiscrepancy,
} from './known.js';
import { loadSpecs } from './openapi.js';
import type { ProbeSnapshot } from './report.js';
import { extractSdkTypes } from './types-extract.js';
import { loadSdkTypeMap, SDK_TYPE_MAP_FILE, type SdkTypeMapEntry } from './types-map.js';
import {
  buildTypesReport,
  renderTypesMarkdown,
  shouldFailTypes,
  typesSummaryLines,
  type TypesFailOn,
} from './types-report.js';

const FAIL_ON: readonly TypesFailOn[] = ['warning', 'never'];

export const TYPES_HELP = `Usage: pnpm drift:types [--fail-on warning|never] [--only <marketplace>] [--map <file>] [--root <dir>]
                        [--out-dir <dir>] [--snapshots-dir <dir>] [--specs-dir <dir>] [--known <file> | --no-known]

Compare the SDK TypeScript types listed in the type map (default: ${SDK_TYPE_MAP_FILE}) with the
response schemas in specs/, quoting the wire baseline in probe-snapshots/ as evidence, and write
<out-dir>/types-report.md and <out-dir>/types-report.json. Warn-only by default (--fail-on never).`;

export function runTypesCli(argv: readonly string[], io: CliIo): number {
  let flags;
  try {
    ({ values: flags } = parseArgs({
      args: [...argv],
      options: {
        'fail-on': { type: 'string', default: 'never' },
        only: { type: 'string', multiple: true },
        map: { type: 'string', default: SDK_TYPE_MAP_FILE },
        root: { type: 'string', default: '.' },
        'out-dir': { type: 'string', default: 'drift-output' },
        'snapshots-dir': { type: 'string', default: 'probe-snapshots' },
        'specs-dir': { type: 'string', default: 'specs' },
        known: { type: 'string' },
        'no-known': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    io.error(`✖ ${(err as Error).message}`);
    io.error(TYPES_HELP);
    return 2;
  }
  if (flags.help) {
    io.log(TYPES_HELP);
    return 0;
  }
  const failOn = flags['fail-on'] as TypesFailOn;
  if (!FAIL_ON.includes(failOn)) {
    io.error(`✖ --fail-on must be one of ${FAIL_ON.join(', ')} (got ${flags['fail-on']})`);
    return 2;
  }
  if (flags.known !== undefined && flags['no-known']) {
    io.error('✖ --known and --no-known are mutually exclusive');
    return 2;
  }

  const rootDir = resolve(io.cwd, flags.root);
  const specsDir = resolve(io.cwd, flags['specs-dir']);
  const snapshotsDir = resolve(io.cwd, flags['snapshots-dir']);
  const outDir = resolve(io.cwd, flags['out-dir']);
  if (!existsSync(specsDir)) {
    io.error(`✖ missing input: ${specsDir}`);
    return 2;
  }

  let entries: SdkTypeMapEntry[];
  let overlay: KnownDiscrepancy[] | undefined;
  const knownPath =
    flags.known !== undefined
      ? resolve(io.cwd, flags.known)
      : join(snapshotsDir, KNOWN_DISCREPANCIES_FILE);
  try {
    entries = loadSdkTypeMap(resolve(io.cwd, flags.map));
    if (!flags['no-known']) {
      overlay = loadKnownDiscrepancies(knownPath, { optional: flags.known === undefined });
    }
  } catch (err) {
    io.error(`✖ ${(err as Error).message}`);
    return 2;
  }
  if (flags.only?.length) {
    const known = [...new Set(entries.map((e) => e.marketplace))];
    entries = entries.filter((e) => flags.only!.includes(e.marketplace));
    if (!entries.length) {
      io.error(`✖ --only matched no map entry. Marketplaces in the map: ${known.join(', ')}`);
      return 2;
    }
  }

  let snapshots: ProbeSnapshot[] = [];
  try {
    if (existsSync(snapshotsDir)) {
      snapshots = readdirSync(snapshotsDir)
        .filter((f) => f.endsWith('.json') && f !== KNOWN_DISCREPANCIES_FILE)
        .filter((f) => resolve(snapshotsDir, f) !== knownPath)
        .sort()
        .map((f) => JSON.parse(readFileSync(join(snapshotsDir, f), 'utf8')) as ProbeSnapshot);
    }
  } catch (err) {
    io.error(`✖ could not read probe snapshots: ${(err as Error).message}`);
    return 2;
  }

  const extracted = extractSdkTypes(
    entries.map((e) => ({ source: e.source, name: e.sdkType })),
    { rootDir },
  );
  const { report, problems } = buildTypesReport({
    entries,
    nodes: extracted.nodes,
    reached: extracted.reached,
    specs: loadSpecs(specsDir, [...new Set(entries.map((e) => e.marketplace))]),
    snapshots,
    ...(overlay
      ? {
          overlay: {
            entries: overlay,
            source: (flags.known ?? join(flags['snapshots-dir'], KNOWN_DISCREPANCIES_FILE)).replace(
              /\\/g,
              '/',
            ),
          },
        }
      : {}),
  });
  const allProblems = [...new Set([...extracted.problems, ...problems])];
  if (allProblems.length) {
    io.error(`✖ the type map does not resolve against the inputs:`);
    for (const p of allProblems) io.error(`  - ${p}`);
    return 2;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'types-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'types-report.md'), renderTypesMarkdown(report), 'utf8');
  for (const line of typesSummaryLines(report)) io.log(line);
  io.log(`→ wrote ${join(flags['out-dir'], 'types-report.md')} and types-report.json`);

  if (shouldFailTypes(report, failOn)) {
    io.log('✖ SDK-type warnings — see types-report.md');
    return 1;
  }
  io.log(
    failOn === 'never' ? '✓ report written (--fail-on never: warn-only)' : '✓ no SDK-type warnings',
  );
  return 0;
}
