/**
 * `pnpm drift` — compare the committed probe snapshots' wire shapes with `specs/`.
 *
 *   pnpm drift                              # all marketplaces, fail on breaking findings
 *   pnpm drift --only trendyol              # one marketplace (repeatable)
 *   pnpm drift --fail-on additive           # also fail on undocumented fields
 *   pnpm drift --fail-on never              # report only
 *
 * Flags
 *   --only <marketplace>                    restrict to one marketplace (repeatable)
 *   --fail-on breaking|additive|never       exit 1 threshold (default: breaking)
 *   --out-dir <dir>                         where report.md / report.json go (default: drift-output/)
 *   --snapshots-dir <dir>                   probe snapshots to read (default: probe-snapshots/)
 *   --specs-dir <dir>                       OpenAPI collection to read (default: specs/)
 *   --known <file>                          known-discrepancy overlay (default:
 *                                           <snapshots-dir>/known-discrepancies.json, optional)
 *   --no-known                              ignore the overlay
 *
 * Exit codes: 0 no finding at or above --fail-on (or no wire baseline yet),
 * 1 findings at or above --fail-on, 2 usage / input error.
 *
 * Reads committed files only: no network, no credentials.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  applyKnownDiscrepancies,
  KNOWN_DISCREPANCIES_FILE,
  loadKnownDiscrepancies,
  type KnownDiscrepancy,
} from './known.js';
import { loadSpecs } from './openapi.js';
import {
  buildDriftReport,
  renderMarkdown,
  shouldFail,
  summaryLines,
  type FailOn,
  type ProbeSnapshot,
} from './report.js';

export interface CliIo {
  cwd: string;
  log: (line: string) => void;
  error: (line: string) => void;
}

const FAIL_ON: readonly FailOn[] = ['breaking', 'additive', 'never'];

export const HELP = `Usage: pnpm drift [--only <marketplace>] [--fail-on breaking|additive|never] [--out-dir <dir>]
                  [--snapshots-dir <dir>] [--specs-dir <dir>] [--known <file> | --no-known]

Compare the wire shapes recorded in probe-snapshots/*.json with the response schemas in specs/
and write <out-dir>/report.md and <out-dir>/report.json. Findings listed in the known-discrepancy
overlay (default: <snapshots-dir>/${KNOWN_DISCREPANCIES_FILE}) are reported as "accepted".
Reads committed files only.`;

export function runCli(argv: readonly string[], io: CliIo): number {
  let flags;
  try {
    ({ values: flags } = parseArgs({
      args: [...argv],
      options: {
        only: { type: 'string', multiple: true },
        'fail-on': { type: 'string', default: 'breaking' },
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
    io.error(HELP);
    return 2;
  }
  if (flags.help) {
    io.log(HELP);
    return 0;
  }
  const failOn = flags['fail-on'] as FailOn;
  if (!FAIL_ON.includes(failOn)) {
    io.error(`✖ --fail-on must be one of ${FAIL_ON.join(', ')} (got ${flags['fail-on']})`);
    return 2;
  }

  if (flags.known !== undefined && flags['no-known']) {
    io.error('✖ --known and --no-known are mutually exclusive');
    return 2;
  }

  const snapshotsDir = resolve(io.cwd, flags['snapshots-dir']);
  const specsDir = resolve(io.cwd, flags['specs-dir']);
  const outDir = resolve(io.cwd, flags['out-dir']);
  if (!existsSync(snapshotsDir) || !existsSync(specsDir)) {
    io.error(`✖ missing input: ${!existsSync(snapshotsDir) ? snapshotsDir : specsDir}`);
    return 2;
  }

  // The default overlay lives next to the snapshots and may be absent; an explicit one must exist.
  const knownPath =
    flags.known !== undefined
      ? resolve(io.cwd, flags.known)
      : join(snapshotsDir, KNOWN_DISCREPANCIES_FILE);
  let overlay: KnownDiscrepancy[] | undefined;
  if (!flags['no-known']) {
    try {
      overlay = loadKnownDiscrepancies(knownPath, { optional: flags.known === undefined });
    } catch (err) {
      io.error(`✖ ${(err as Error).message}`);
      return 2;
    }
  }

  let snapshots: ProbeSnapshot[];
  try {
    snapshots = readdirSync(snapshotsDir)
      .filter((f) => f.endsWith('.json') && f !== KNOWN_DISCREPANCIES_FILE)
      .filter((f) => resolve(snapshotsDir, f) !== knownPath)
      .sort()
      .map((f) => JSON.parse(readFileSync(join(snapshotsDir, f), 'utf8')) as ProbeSnapshot);
  } catch (err) {
    io.error(`✖ could not read probe snapshots: ${(err as Error).message}`);
    return 2;
  }
  const known = snapshots.map((s) => s.marketplace);
  if (flags.only?.length) {
    snapshots = snapshots.filter((s) => flags.only!.includes(s.marketplace));
    if (!snapshots.length) {
      io.error(`✖ --only matched no snapshot. Known marketplaces: ${known.join(', ') || '(none)'}`);
      return 2;
    }
  }

  const specs = loadSpecs(
    specsDir,
    snapshots.map((s) => s.marketplace),
  );
  let report = buildDriftReport(snapshots, specs);
  if (overlay) {
    const source = flags.known ?? join(flags['snapshots-dir'], KNOWN_DISCREPANCIES_FILE);
    report = applyKnownDiscrepancies(report, overlay, source.replace(/\\/g, '/'));
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'report.md'), renderMarkdown(report), 'utf8');

  for (const line of summaryLines(report)) io.log(line);
  io.log(`→ wrote ${join(flags['out-dir'], 'report.md')} and report.json`);

  if (!report.wireBaseline) {
    io.log(
      'No wire baseline in the selected snapshots yet — run `pnpm probe` (read-only, against prod) to capture one, then `pnpm drift`.',
    );
    return 0;
  }
  if (shouldFail(report, failOn)) {
    io.log(`✖ drift findings at or above "${failOn}" — see report.md`);
    return 1;
  }
  io.log(
    failOn === 'never'
      ? '✓ report written (--fail-on never)'
      : `✓ no findings at or above "${failOn}"`,
  );
  return 0;
}
