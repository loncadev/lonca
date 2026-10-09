/**
 * Known-discrepancy overlay (`probe-snapshots/known-discrepancies.json`).
 *
 * Some findings are real but already understood: the marketplace's own docs
 * are wrong and the SDK copes (Trendyol `product-categories` returns an object,
 * not the documented array), or the upstream spec just omits `nullable`. The
 * specs themselves cannot carry that knowledge — the Hepsiburada documents are
 * redistributed unchanged and `specs/trendyol` is generated — so it lives in a
 * hand-maintained overlay next to the snapshots it explains.
 *
 * An entry accepts one finding kind at one path of one operation; a matching
 * finding is downgraded to `accepted` (info) and carries the entry's reason.
 * Entries that matched nothing are reported as stale so the file does not rot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { displayPath, finding, type Finding, type FindingKind } from './engine.js';
import { addCounts, countFindings, emptyCounts, type DriftReport } from './report.js';

/** Default file name, resolved inside the snapshots directory. */
export const KNOWN_DISCREPANCIES_FILE = 'known-discrepancies.json';

/** Finding kinds an overlay entry may accept (the ones that need attention). */
export const ACCEPTABLE_KINDS: readonly FindingKind[] = [
  'type-mismatch',
  'missing-required',
  'undocumented-field',
  'undocumented-null',
  'unmatched-operation',
];

export interface KnownDiscrepancy {
  /** Marketplace id, as in the snapshot (`trendyol`, `hepsiburada`). */
  marketplace: string;
  /** Operation key as printed in the report heading, e.g. `GET /integration/product/product-categories`. */
  operation: string;
  /** Field path as printed in the report (`(root)`, `content[].lines[]`), or `*` for any path in the operation. */
  path: string;
  /** The finding kind this entry accepts. */
  kind: FindingKind;
  /** Why the discrepancy is accepted — shown next to the finding. */
  reason: string;
  /** Date the entry was added, `YYYY-MM-DD`. */
  since: string;
}

/** What the overlay did in one run (`report.known`). */
export interface KnownSummary {
  /** Where the entries came from (file path as given). */
  source: string;
  /** Number of entries in the overlay. */
  entries: number;
  /** Number of findings downgraded to `accepted`. */
  accepted: number;
  /** Entries for a marketplace in this report that matched no finding. */
  stale: KnownDiscrepancy[];
}

const ENTRY_KEYS = ['marketplace', 'operation', 'path', 'kind', 'reason', 'since'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Raised for an unreadable or invalid overlay; `message` lists every problem. */
export class KnownDiscrepanciesError extends Error {
  override name = 'KnownDiscrepanciesError';
}

/**
 * Validate a parsed overlay document and return its entries. Every problem is
 * collected and thrown as one {@link KnownDiscrepanciesError}.
 */
export function parseKnownDiscrepancies(value: unknown, source: string): KnownDiscrepancy[] {
  const problems: string[] = [];
  if (!isRecord(value)) {
    throw new KnownDiscrepanciesError(
      `${source}: expected an object with an "entries" array, got ${kindOf(value)}`,
    );
  }
  for (const key of Object.keys(value)) {
    if (key !== '$comment' && key !== 'entries') problems.push(`unknown top-level key "${key}"`);
  }
  if (value.$comment !== undefined && typeof value.$comment !== 'string') {
    problems.push('"$comment" must be a string');
  }
  if (!Array.isArray(value.entries)) {
    problems.push(`"entries" must be an array, got ${kindOf(value.entries)}`);
    throw new KnownDiscrepanciesError(formatProblems(source, problems));
  }

  const entries: KnownDiscrepancy[] = [];
  const seen = new Map<string, number>();
  value.entries.forEach((raw: unknown, i: number) => {
    const at = `entries[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${at}: expected an object, got ${kindOf(raw)}`);
      return;
    }
    const before = problems.length;
    for (const key of Object.keys(raw)) {
      if (!(ENTRY_KEYS as readonly string[]).includes(key))
        problems.push(`${at}: unknown key "${key}"`);
    }
    for (const key of ENTRY_KEYS) {
      const v = raw[key];
      if (typeof v !== 'string' || v.trim() === '')
        problems.push(`${at}.${key}: required, must be a non-empty string`);
    }
    if (typeof raw.kind === 'string' && !ACCEPTABLE_KINDS.includes(raw.kind as FindingKind)) {
      problems.push(`${at}.kind: "${raw.kind}" is not one of ${ACCEPTABLE_KINDS.join(', ')}`);
    }
    if (typeof raw.since === 'string' && raw.since !== '' && !isDate(raw.since)) {
      problems.push(`${at}.since: "${raw.since}" is not a YYYY-MM-DD date`);
    }
    if (problems.length > before) return;
    const entry = raw as unknown as KnownDiscrepancy;
    const id = entryId(entry);
    const first = seen.get(id);
    if (first !== undefined) {
      problems.push(
        `${at}: duplicate of entries[${first}] (same marketplace, operation, path, kind)`,
      );
      return;
    }
    seen.set(id, i);
    entries.push({
      marketplace: entry.marketplace,
      operation: entry.operation,
      path: entry.path,
      kind: entry.kind,
      reason: entry.reason,
      since: entry.since,
    });
  });
  if (problems.length) throw new KnownDiscrepanciesError(formatProblems(source, problems));
  return entries;
}

/**
 * Read and validate an overlay file. A missing file returns `undefined` when
 * `optional` is set (the default overlay), and throws otherwise.
 */
export function loadKnownDiscrepancies(
  file: string,
  { optional = false }: { optional?: boolean } = {},
): KnownDiscrepancy[] | undefined {
  if (!existsSync(file)) {
    if (optional) return undefined;
    throw new KnownDiscrepanciesError(`${file}: file not found`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new KnownDiscrepanciesError(`${file}: not valid JSON (${(err as Error).message})`);
  }
  return parseKnownDiscrepancies(parsed, file);
}

/**
 * Downgrade every finding an overlay entry matches to `accepted` (info) and
 * recompute the counts. Returns a new report with `known` set; the input is
 * not modified. Only entries for a marketplace present in the report can be
 * stale, so `--only` does not flag the other marketplaces' entries.
 */
export function applyKnownDiscrepancies(
  report: DriftReport,
  entries: readonly KnownDiscrepancy[],
  source: string,
): DriftReport {
  const hits = new Map<KnownDiscrepancy, number>(entries.map((e) => [e, 0]));
  let accepted = 0;
  const counts = emptyCounts();
  const marketplaces = report.marketplaces.map((m) => {
    const mine = entries.filter((e) => e.marketplace === m.marketplace);
    const mCounts = emptyCounts();
    const operations = m.operations.map((op) => {
      const forOp = mine.filter((e) => e.operation === op.key);
      const findings = op.findings.map((f) => {
        const entry = forOp.find(
          (e) => e.kind === f.kind && (e.path === '*' || e.path === displayPath(f.path)),
        );
        if (!entry) return f;
        hits.set(entry, hits.get(entry)! + 1);
        accepted += 1;
        return acceptedFinding(f, entry);
      });
      const opCounts = countFindings(findings);
      addCounts(mCounts, opCounts);
      return { ...op, findings, counts: opCounts };
    });
    addCounts(counts, mCounts);
    return { ...m, operations, counts: mCounts };
  });
  const inReport = new Set(report.marketplaces.map((m) => m.marketplace));
  const stale = entries.filter((e) => inReport.has(e.marketplace) && hits.get(e) === 0);
  return {
    ...report,
    marketplaces,
    counts,
    known: { source, entries: entries.length, accepted, stale },
  };
}

function acceptedFinding(f: Finding, entry: KnownDiscrepancy): Finding {
  const { kind, severity: _severity, path, message, ...rest } = f;
  return {
    ...finding('accepted', path, message, rest),
    accepts: kind,
    reason: entry.reason,
    since: entry.since,
  };
}

function entryId(e: KnownDiscrepancy): string {
  return [e.marketplace, e.operation, e.path, e.kind].join('\u0000');
}

function isDate(s: string): boolean {
  return DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function kindOf(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (v === null) return 'null';
  return Array.isArray(v) ? 'an array' : `a ${typeof v}`;
}

function formatProblems(source: string, problems: readonly string[]): string {
  return [`${source}: invalid known-discrepancy overlay`, ...problems.map((p) => `  - ${p}`)].join(
    '\n',
  );
}
