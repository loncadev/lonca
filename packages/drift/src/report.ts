/**
 * Drift report: run the engine over every wire exchange recorded in the probe
 * snapshots and render the result as JSON and as Markdown that fits in a
 * GitHub issue body.
 */
import {
  compareResponse,
  displayPath,
  finding,
  SEVERITIES,
  type Finding,
  type Severity,
} from './engine.js';
import type { KnownSummary } from './known.js';
import { getOperation, responseSchemaFor, type SpecFile } from './openapi.js';
import { isUnmatched } from './operations.js';
import { mergeShapes, type Shape } from './shape.js';
import { isSuccess, type WireBody, type WireExchange } from './wire.js';

/** The parts of a committed probe snapshot (`probe-snapshots/<marketplace>.json`) drift reads. */
export interface ProbeSnapshot {
  marketplace: string;
  env?: string;
  probes: Record<string, { status: string; shape?: Shape; wire?: WireExchange[] }>;
}

export interface OperationReport {
  /** `"<METHOD> <path template>"`, or `"<METHOD> <host><redacted path>"` when no spec matched. */
  key: string;
  method: string;
  path: string;
  status: number;
  spec?: string;
  operationId?: string;
  unmatched?: true;
  host?: string;
  /** Probe names whose wire calls hit this operation. */
  probes: string[];
  findings: Finding[];
  counts: Record<Severity, number>;
}

export interface MarketplaceReport {
  marketplace: string;
  env?: string;
  /** Whether at least one probe in the snapshot carries a `wire` list. */
  wireBaseline: boolean;
  /** Probes whose snapshot entry has no `wire` field (captured before wire recording existed). */
  probesWithoutWire: string[];
  operations: OperationReport[];
  counts: Record<Severity, number>;
}

export interface DriftReport {
  marketplaces: MarketplaceReport[];
  counts: Record<Severity, number>;
  /** `true` when at least one selected marketplace has wire data to compare. */
  wireBaseline: boolean;
  /** Set when a known-discrepancy overlay was applied (see `applyKnownDiscrepancies`). */
  known?: KnownSummary;
}

export type FailOn = 'breaking' | 'additive' | 'never';

export function emptyCounts(): Record<Severity, number> {
  return { breaking: 0, additive: 0, warning: 0, info: 0 };
}

export function countFindings(findings: readonly Finding[]): Record<Severity, number> {
  const counts = emptyCounts();
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function addCounts(into: Record<Severity, number>, more: Record<Severity, number>): void {
  for (const s of SEVERITIES) into[s] += more[s];
}

interface Group {
  exchange: WireExchange;
  probes: Set<string>;
  bodies: Set<WireBody>;
}

/** Build the drift report for a set of probe snapshots against the loaded specs. */
export function buildDriftReport(
  snapshots: readonly ProbeSnapshot[],
  specs: readonly SpecFile[],
): DriftReport {
  const report: DriftReport = { marketplaces: [], counts: emptyCounts(), wireBaseline: false };
  for (const snapshot of [...snapshots].sort((a, b) =>
    a.marketplace.localeCompare(b.marketplace),
  )) {
    const groups = new Map<string, Group>();
    const probesWithoutWire: string[] = [];
    let wireBaseline = false;
    for (const name of Object.keys(snapshot.probes).sort()) {
      const wire = snapshot.probes[name]!.wire;
      if (!wire) {
        probesWithoutWire.push(name);
        continue;
      }
      wireBaseline = true;
      for (const ex of wire) {
        const id = `${ex.operation.key}\u0000${ex.status}`;
        const g = groups.get(id);
        if (!g) {
          groups.set(id, { exchange: ex, probes: new Set([name]), bodies: new Set([ex.body]) });
          continue;
        }
        g.probes.add(name);
        g.bodies.add(ex.body);
        if (ex.shape) {
          const shape = g.exchange.shape ? mergeShapes(g.exchange.shape, ex.shape) : ex.shape;
          g.exchange = { ...g.exchange, body: 'json', shape };
        }
      }
    }

    const operations = [...groups.values()]
      .map((g) => operationReport(g, specs))
      .sort((a, b) => a.key.localeCompare(b.key) || a.status - b.status);
    const counts = emptyCounts();
    for (const op of operations) addCounts(counts, op.counts);
    addCounts(report.counts, counts);
    report.wireBaseline ||= wireBaseline;
    report.marketplaces.push({
      marketplace: snapshot.marketplace,
      ...(snapshot.env ? { env: snapshot.env } : {}),
      wireBaseline,
      probesWithoutWire,
      operations,
      counts,
    });
  }
  return report;
}

function operationReport(group: Group, specs: readonly SpecFile[]): OperationReport {
  const ex = group.exchange;
  const op = ex.operation;
  const base = {
    key: op.key,
    method: op.method,
    path: op.path,
    status: ex.status,
    probes: [...group.probes].sort(),
  };
  const done = (extra: Partial<OperationReport>, findings: Finding[]): OperationReport => ({
    ...base,
    ...extra,
    findings,
    counts: countFindings(findings),
  });

  if (isUnmatched(op)) {
    return done({ unmatched: true, host: op.host }, [
      finding(
        'unmatched-operation',
        '',
        `no spec operation matches ${op.method} ${op.host}${op.path} — the endpoint is undocumented in specs/, or the SDK calls the wrong path`,
      ),
    ]);
  }

  const ids = { spec: op.spec, ...(op.operationId ? { operationId: op.operationId } : {}) };
  const spec = specs.find((s) => s.id === op.spec);
  const operation = spec && getOperation(spec.document, op.specPath, op.method);
  if (!spec || !operation) {
    return done(ids, [
      finding(
        'unmatched-operation',
        '',
        `${op.spec} no longer documents ${op.method} ${op.specPath} (the spec changed since the snapshot was taken)`,
      ),
    ]);
  }
  if (!isSuccess(ex.status)) {
    return done(ids, [
      finding(
        'uncomparable',
        '',
        `HTTP ${ex.status}: error bodies are not recorded, nothing to compare`,
      ),
    ]);
  }
  if (ex.body !== 'json' || !ex.shape) {
    return done(ids, [
      finding(
        'uncomparable',
        '',
        `response body was ${ex.body}${ex.contentType ? ` (${ex.contentType})` : ''}, not JSON`,
      ),
    ]);
  }
  const lookup = responseSchemaFor(spec.document, operation, ex.status);
  if (!lookup.found) return done(ids, [finding('uncomparable', '', lookup.reason)]);

  const findings = compareResponse({
    schema: lookup.schema,
    shape: ex.shape,
    document: spec.document,
  });
  if (group.bodies.size > 1) {
    findings.unshift(
      finding(
        'uncomparable',
        '',
        `probes saw different body kinds (${[...group.bodies].sort().join(', ')}); only the JSON bodies were compared`,
      ),
    );
  }
  return done(ids, findings);
}

/** Whether the report should fail the run under `--fail-on`. */
export function shouldFail(report: DriftReport, failOn: FailOn): boolean {
  if (failOn === 'never') return false;
  if (failOn === 'additive') return report.counts.breaking + report.counts.additive > 0;
  return report.counts.breaking > 0;
}

// ─── Markdown ──────────────────────────────────────────────────────────────

export const MAX_MARKDOWN_BYTES = 60_000;

const SEVERITY_TITLE: Record<Severity, string> = {
  breaking: 'Breaking',
  additive: 'Additive',
  warning: 'Warning',
  info: 'Info',
};

const HOW_TO_ACT = [
  '## How to act',
  '',
  '- **breaking** (`type-mismatch`, `missing-required`): the wire contradicts the definition. Check the SDK types and normalisers for that field and fix the SDK if it relies on the documented shape. If the marketplace is simply wrong about its own API and the SDK copes, accept it in `probe-snapshots/known-discrepancies.json` with a reason (it shows up as `accepted`), or — for specs Lonca generates — record the observed type with `x-lonca-observed-types` (it shows up as `known`).',
  '- **additive** (`undocumented-field`): the field is real but undocumented. Expose it in the SDK if it is useful, and mark the spec property with `x-lonca-observed: true` so it shows up as `known` next time (for Trendyol the observation pass of `pnpm specs:trendyol:build` writes these annotations; see `specs/trendyol/README.md`).',
  '- **warning** (`undocumented-null`): the property was `null` on the wire but the schema is not nullable — usually the upstream spec just omits `nullable`. Make sure the SDK type allows `null` (or normalises it away), then accept it in `probe-snapshots/known-discrepancies.json` (or record `x-lonca-observed-types: ["null"]` in a spec Lonca generates).',
  '- **warning** (`unmatched-operation`): the SDK calls an endpoint `specs/` does not document. Add the definition, or fix the SDK path.',
  '- **info** (`known`, `accepted`, `not-observed`, `uncomparable`): no action needed; `not-observed` only means this sample did not contain the optional field. A stale overlay entry matched nothing in this run: the discrepancy is gone (remove the entry) or the operation / path is misspelled.',
  '',
  'Regenerate the inputs with `pnpm probe` (read-only, against prod) and re-run `pnpm drift`.',
];

function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

function findingLine(f: Finding): string {
  if (f.kind === 'accepted') {
    return `- ${code('accepted')} ${code(displayPath(f.path))} (was ${code(f.accepts ?? '?')}): ${f.message} — ${f.reason ?? ''}`;
  }
  return `- ${code(f.kind)} ${code(displayPath(f.path))}: ${f.message}`;
}

function knownBlock(known: KnownSummary): string[] {
  const lines = [
    `Known-discrepancy overlay ${code(known.source)}: ${known.entries} entr${known.entries === 1 ? 'y' : 'ies'}, ${known.accepted} finding(s) accepted, ${known.stale.length} stale.`,
    '',
  ];
  if (known.stale.length) {
    lines.push(
      '### Stale overlay entries',
      '',
      'These entries matched no finding in this run — remove them, or fix the operation / path spelling (info, never fails the run):',
      '',
      ...known.stale.map(
        (e) =>
          `- ${e.marketplace} ${code(e.operation)} ${code(e.path)} ${code(e.kind)} (since ${e.since}): ${e.reason}`,
      ),
      '',
    );
  }
  return lines;
}

function operationBlock(op: OperationReport): string {
  const lines: string[] = [`### ${code(op.key)} → ${op.status}`, ''];
  const meta = op.unmatched
    ? [`host ${code(op.host ?? '')}`, 'no matching spec operation']
    : [code(op.spec ?? ''), ...(op.operationId ? [code(op.operationId)] : [])];
  lines.push([...meta, `probes: ${op.probes.map(code).join(', ')}`].join(' · '), '');
  for (const severity of SEVERITIES) {
    const list = op.findings
      .filter((f) => f.severity === severity)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
    if (!list.length) continue;
    const notObserved = list.filter((f) => f.kind === 'not-observed');
    const listed = list.filter((f) => f.kind !== 'not-observed').map(findingLine);
    if (notObserved.length) {
      const fields = notObserved.reduce((n, f) => n + (f.fields?.length ?? 0), 0);
      listed.push(
        `- ${code('not-observed')}: ${fields} optional documented propert${fields === 1 ? 'y' : 'ies'} not seen in this sample, across ${notObserved.length} object(s) (field names in report.json)`,
      );
    }
    if (severity === 'info') {
      lines.push(
        `<details><summary>Info (${list.length})</summary>`,
        '',
        ...listed,
        '',
        '</details>',
        '',
      );
    } else {
      lines.push(`**${SEVERITY_TITLE[severity]} (${list.length})**`, '', ...listed, '');
    }
  }
  return lines.join('\n');
}

function bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Render the report as Markdown, truncated (with a note) to fit `maxBytes`. */
export function renderMarkdown(report: DriftReport, maxBytes = MAX_MARKDOWN_BYTES): string {
  const head: string[] = [
    '# API drift report',
    '',
    'Wire responses recorded by the contract probes (`probe-snapshots/*.json`, key sets and JSON types only) compared with the documented response schemas in `specs/`.',
    '',
    '| Marketplace | Env | Operations | Breaking | Additive | Warning | Info |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const m of report.marketplaces) {
    const c = m.counts;
    head.push(
      `| ${m.marketplace} | ${m.env ?? '-'} | ${m.wireBaseline ? m.operations.length : 'no wire baseline'} | ${c.breaking} | ${c.additive} | ${c.warning} | ${c.info} |`,
    );
  }
  head.push('');
  if (report.known) head.push(...knownBlock(report.known));

  const footer = HOW_TO_ACT.join('\n');
  const truncationReserve = 400;
  let body = head.join('\n');
  let omitted = 0;
  const append = (block: string): void => {
    if (omitted || bytes(body) + bytes(block) + bytes(footer) + truncationReserve > maxBytes) {
      omitted += 1;
      return;
    }
    body += `\n${block}`;
  };

  for (const m of report.marketplaces) {
    const intro: string[] = [`## ${m.marketplace}${m.env ? ` (${m.env})` : ''}`, ''];
    if (!m.wireBaseline) {
      intro.push(
        'No wire baseline: this snapshot was captured before wire recording existed. Run `pnpm probe` to capture one.',
        '',
      );
    } else if (m.probesWithoutWire.length) {
      intro.push(
        `Probes without wire data (not compared): ${m.probesWithoutWire.map(code).join(', ')}.`,
        '',
      );
    }
    append(intro.join('\n'));
    const clean = m.operations.filter((op) => op.findings.length === 0);
    for (const op of m.operations) if (op.findings.length) append(operationBlock(op));
    if (clean.length) {
      append(
        [
          `Operations with no findings: ${clean.map((op) => `${code(op.key)} → ${op.status}`).join(', ')}.`,
          '',
        ].join('\n'),
      );
    }
  }

  if (omitted) {
    body += `\n> **Truncated:** ${omitted} section(s) omitted to keep this report under ${Math.round(maxBytes / 1000)} KB. The full findings are in \`drift-output/report.json\`.\n`;
  }
  return `${body}\n${footer}\n`;
}

/** One-line-per-marketplace console summary (plus one line for the overlay, when applied). */
export function summaryLines(report: DriftReport): string[] {
  const lines = report.marketplaces.map((m) => {
    if (!m.wireBaseline)
      return `${m.marketplace}: no wire baseline — run \`pnpm probe\` to capture`;
    const c = m.counts;
    const accepted = m.operations.reduce(
      (n, op) => n + op.findings.filter((f) => f.kind === 'accepted').length,
      0,
    );
    return `${m.marketplace} (${m.env ?? '-'}): ${m.operations.length} operation(s) — ${c.breaking} breaking / ${c.additive} additive / ${c.warning} warning / ${c.info} info${accepted ? ` (${accepted} accepted)` : ''}`;
  });
  if (report.known) {
    const k = report.known;
    lines.push(
      `known discrepancies (${k.source}): ${k.accepted} finding(s) accepted by ${k.entries} entr${k.entries === 1 ? 'y' : 'ies'}${k.stale.length ? `, ${k.stale.length} stale entr${k.stale.length === 1 ? 'y' : 'ies'} (see report.md)` : ''}`,
    );
  }
  return lines;
}
