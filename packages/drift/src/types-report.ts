/**
 * SDK-types report (`pnpm drift:types`): run the SDK type ↔ spec comparison
 * over every entry of the type map and render it as JSON and as Markdown
 * (also used as the CI step summary).
 */
import {
  normalizeSchema,
  SEVERITIES,
  type Finding,
  type FindingKind,
  type Severity,
} from './engine.js';
import { createOverlayMatcher, type KnownDiscrepancy, type KnownSummary } from './known.js';
import { getOperation, responseSchemaFor, type SpecFile } from './openapi.js';
import { findOperationByKey } from './operations.js';
import {
  addCounts,
  bytes,
  code,
  countFindings,
  emptyCounts,
  knownBlock,
  MAX_MARKDOWN_BYTES,
  type ProbeSnapshot,
} from './report.js';
import { mergeShapes, type Shape } from './shape.js';
import { compareSdkType, schemaAt, shapeAt } from './types-compare.js';
import { sdkTypeKey, type SdkTypeNode } from './types-extract.js';
import type { SdkTypeMapEntry } from './types-map.js';
import { isSuccess } from './wire.js';

export interface TypeEntryReport {
  marketplace: string;
  sdkType: string;
  source: string;
  spec: string;
  operation: string;
  pointer: string;
  note?: string;
  /** HTTP status whose documented schema was used. */
  status: number;
  /** Named SDK types reached from `sdkType` (itself included), `<source>#<name>`. */
  types: string[];
  /** SDK properties matched with a documented property. */
  compared: number;
  /** Whether the probe snapshot has wire data for this operation. */
  wireBaseline: boolean;
  findings: Finding[];
  counts: Record<Severity, number>;
}

export interface TypesMarketplaceReport {
  marketplace: string;
  entries: TypeEntryReport[];
  /** Distinct named SDK types covered by the entries. */
  types: number;
  counts: Record<Severity, number>;
}

export interface TypesReport {
  marketplaces: TypesMarketplaceReport[];
  counts: Record<Severity, number>;
  /** Findings per kind (an `accepted` finding counts as `accepted`). */
  kinds: Partial<Record<FindingKind, number>>;
  /** Set when a known-discrepancy overlay was applied. */
  known?: KnownSummary;
}

export interface BuildTypesReportInput {
  entries: readonly SdkTypeMapEntry[];
  /** Extracted SDK types keyed by `sdkTypeKey`. */
  nodes: ReadonlyMap<string, SdkTypeNode>;
  /** Named types reached per extracted type, keyed like `nodes`. */
  reached?: ReadonlyMap<string, readonly string[]>;
  specs: readonly SpecFile[];
  snapshots: readonly ProbeSnapshot[];
  overlay?: { entries: readonly KnownDiscrepancy[]; source: string };
}

export type TypesFailOn = 'warning' | 'never';

/**
 * Build the report. Map entries that cannot be resolved against the inputs
 * (unknown spec, operation, response schema or pointer, or a type that was
 * not extracted) are returned as `problems` — the CLI treats them as input
 * errors — and left out of the report.
 */
export function buildTypesReport(input: BuildTypesReportInput): {
  report: TypesReport;
  problems: string[];
} {
  const problems: string[] = [];
  const matcher = input.overlay
    ? createOverlayMatcher(input.overlay.entries, 'sdk-types')
    : undefined;
  const byMarketplace = new Map<string, TypeEntryReport[]>();
  input.entries.forEach((entry, i) => {
    const at = `entries[${i}] (${entry.sdkType} → ${entry.operation} ${entry.pointer})`;
    const node = input.nodes.get(sdkTypeKey({ source: entry.source, name: entry.sdkType }));
    if (!node) {
      problems.push(`${at}: SDK type not extracted`);
      return;
    }
    const spec = input.specs.find((s) => s.id === entry.spec);
    if (!spec) {
      problems.push(`${at}: spec ${entry.spec} not found`);
      return;
    }
    const op = findOperationByKey(spec, entry.operation);
    const operation = op && getOperation(spec.document, op.specPath, op.method);
    if (!op || !operation) {
      problems.push(`${at}: ${entry.spec} documents no operation "${entry.operation}"`);
      return;
    }
    const status = successStatus(operation.responses ?? {});
    const lookup = responseSchemaFor(spec.document, operation, status);
    if (!lookup.found) {
      problems.push(`${at}: ${lookup.reason}`);
      return;
    }
    const root = normalizeSchema(lookup.schema, spec.document);
    const target = schemaAt(root, entry.pointer, spec.document);
    if (!target) {
      problems.push(`${at}: pointer "${entry.pointer}" leads nowhere in the documented response`);
      return;
    }
    const path = entry.pointer === '(root)' ? '' : entry.pointer;
    const wireRoot = wireShape(input.snapshots, entry);
    const result = compareSdkType({
      node,
      sdkType: entry.sdkType,
      spec: target,
      document: spec.document,
      path,
      wireBaseline: wireRoot !== undefined,
      wire: shapeAt(wireRoot, entry.pointer),
      ...(entry.ignore ? { ignore: entry.ignore } : {}),
      ...(entry.coerced ? { coerced: entry.coerced } : {}),
    });
    const findings = matcher
      ? result.findings.map((f) => matcher.accept(entry.marketplace, entry.operation, f))
      : result.findings;
    const reports = byMarketplace.get(entry.marketplace) ?? [];
    reports.push({
      marketplace: entry.marketplace,
      sdkType: entry.sdkType,
      source: entry.source,
      spec: entry.spec,
      operation: entry.operation,
      pointer: entry.pointer,
      ...(entry.note ? { note: entry.note } : {}),
      status,
      types: [
        ...(input.reached?.get(sdkTypeKey({ source: entry.source, name: entry.sdkType })) ?? []),
      ],
      compared: result.compared,
      wireBaseline: wireRoot !== undefined,
      findings,
      counts: countFindings(findings),
    });
    byMarketplace.set(entry.marketplace, reports);
  });

  const report: TypesReport = { marketplaces: [], counts: emptyCounts(), kinds: {} };
  for (const marketplace of [...byMarketplace.keys()].sort()) {
    const entries = byMarketplace.get(marketplace)!;
    const counts = emptyCounts();
    for (const e of entries) {
      addCounts(counts, e.counts);
      for (const f of e.findings) report.kinds[f.kind] = (report.kinds[f.kind] ?? 0) + 1;
    }
    addCounts(report.counts, counts);
    report.marketplaces.push({
      marketplace,
      entries,
      types: new Set(entries.flatMap((e) => e.types)).size,
      counts,
    });
  }
  if (matcher && input.overlay) {
    report.known = matcher.summary(
      input.overlay.source,
      report.marketplaces.map((m) => m.marketplace),
    );
  }
  return { report, problems };
}

/** The documented success status to compare with: 200 when documented, else the first 2xx. */
function successStatus(responses: Record<string, unknown>): number {
  if (responses['200'] !== undefined) return 200;
  const first = Object.keys(responses)
    .filter((k) => /^2\d\d$/.test(k))
    .sort()[0];
  return first ? Number(first) : 200;
}

/** Merged 2xx JSON shape of every wire exchange for the entry's operation, or `undefined`. */
function wireShape(snapshots: readonly ProbeSnapshot[], entry: SdkTypeMapEntry): Shape | undefined {
  let merged: Shape | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.marketplace !== entry.marketplace) continue;
    for (const probe of Object.values(snapshot.probes)) {
      for (const ex of probe.wire ?? []) {
        const op = ex.operation as { key: string; spec?: string };
        if (op.key !== entry.operation || op.spec !== entry.spec) continue;
        if (!isSuccess(ex.status) || !ex.shape) continue;
        merged = merged ? mergeShapes(merged, ex.shape) : ex.shape;
      }
    }
  }
  return merged;
}

/** Whether the report should fail the run under `--fail-on`. */
export function shouldFailTypes(report: TypesReport, failOn: TypesFailOn): boolean {
  return failOn === 'warning' && report.counts.warning > 0;
}

// ─── Markdown ──────────────────────────────────────────────────────────────

const KIND_ORDER: readonly FindingKind[] = [
  'sdk-type-mismatch',
  'sdk-unknown-field',
  'sdk-missing-field',
  'known',
  'accepted',
  'uncomparable',
];

const HOW_TO_ACT = [
  '## How to act',
  '',
  '- **warning** `sdk-type-mismatch`: the SDK type and the documented type do not overlap. Check the wire evidence: when the wire agrees with the spec, the SDK type (and usually its normaliser) is wrong — fix the SDK. When the wire agrees with the SDK, the docs are wrong: record it with `x-lonca-observed-types` (Trendyol) or accept it in `probe-snapshots/known-discrepancies.json` with a reason.',
  '- **warning** `sdk-unknown-field`: the SDK declares a field neither the spec nor the wire baseline has — it may never be populated. Fix the field name, or accept it in the overlay when the field is real but undocumented and simply missing from the sample.',
  '- **info**: `sdk-type-mismatch` where the SDK type is only wider than documented, `sdk-unknown-field` the wire baseline confirms (the docs are incomplete), `sdk-missing-field` (documented fields the SDK leaves on `raw`), `known`, `accepted`, `uncomparable` — no action needed.',
  '',
  'The type map lives in `packages/drift/sdk-type-map.json`; see `packages/drift/README.md#sdk-types-vs-specs`.',
];

function findingLine(f: Finding): string {
  const where = `${code(f.path || '(root)')}${f.sdkPath ? ` (${code(f.sdkPath)})` : ''}`;
  if (f.kind === 'accepted') {
    return `- ${code('accepted')} ${where} (was ${code(f.accepts ?? '?')}): ${f.message} — ${f.reason ?? ''}`;
  }
  return `- ${code(f.kind)} ${where}: ${f.message}`;
}

function entryBlock(e: TypeEntryReport): string {
  const lines = [
    `### ${code(e.sdkType)} → ${code(e.operation)} · ${code(e.pointer)}`,
    '',
    [
      code(e.source),
      `${code(e.spec)} (HTTP ${e.status})`,
      `${e.compared} propert${e.compared === 1 ? 'y' : 'ies'} compared`,
      e.wireBaseline ? 'wire baseline: yes' : 'wire baseline: none',
    ].join(' · '),
    '',
  ];
  if (e.note) lines.push(`> ${e.note}`, '');
  for (const severity of SEVERITIES) {
    const list = e.findings
      .filter((f) => f.severity === severity)
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.path.localeCompare(b.path),
      );
    if (!list.length) continue;
    const missing = list.filter((f) => f.kind === 'sdk-missing-field');
    const listed = list.filter((f) => f.kind !== 'sdk-missing-field').map(findingLine);
    if (missing.length) {
      const fields = missing.reduce((n, f) => n + (f.fields?.length ?? 0), 0);
      listed.push(
        `- ${code('sdk-missing-field')}: ${fields} documented propert${fields === 1 ? 'y' : 'ies'} the SDK type does not declare, across ${missing.length} object(s) (names in types-report.json)`,
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
      lines.push(
        `**${severity === 'warning' ? 'Warning' : severity} (${list.length})**`,
        '',
        ...listed,
        '',
      );
    }
  }
  return lines.join('\n');
}

/** Render the report as Markdown, truncated (with a note) to fit `maxBytes`. */
export function renderTypesMarkdown(report: TypesReport, maxBytes = MAX_MARKDOWN_BYTES): string {
  const head: string[] = [
    '# SDK types vs specs',
    '',
    'SDK TypeScript types that mirror a wire object (`packages/drift/sdk-type-map.json`) compared with the documented response schemas in `specs/`; the prod wire baseline (`probe-snapshots/*.json`) is quoted as evidence. Warn-only.',
    '',
    '| Marketplace | Map entries | SDK types covered | Warning | Info |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const m of report.marketplaces) {
    head.push(
      `| ${m.marketplace} | ${m.entries.length} | ${m.types} | ${m.counts.warning} | ${m.counts.info} |`,
    );
  }
  head.push('', '| Finding | Count |', '| --- | ---: |');
  for (const kind of KIND_ORDER) {
    if (report.kinds[kind]) head.push(`| ${code(kind)} | ${report.kinds[kind]} |`);
  }
  head.push('');
  if (report.known) head.push(...knownBlock(report.known));

  const footer = HOW_TO_ACT.join('\n');
  const reserve = 400;
  let body = head.join('\n');
  let omitted = 0;
  const append = (block: string): void => {
    if (omitted || bytes(body) + bytes(block) + bytes(footer) + reserve > maxBytes) {
      omitted += 1;
      return;
    }
    body += `\n${block}`;
  };
  for (const m of report.marketplaces) {
    append(`## ${m.marketplace}\n`);
    // Entries with warnings first, so a truncated report still shows what needs attention.
    const ordered = [...m.entries].sort((a, b) => b.counts.warning - a.counts.warning);
    const clean = ordered.filter((e) => e.findings.length === 0);
    for (const e of ordered) if (e.findings.length) append(entryBlock(e));
    if (clean.length) {
      append(
        `Entries with no findings: ${clean.map((e) => `${code(e.sdkType)} (${code(e.operation)} ${code(e.pointer)})`).join(', ')}.\n`,
      );
    }
  }
  if (omitted) {
    body += `\n> **Truncated:** ${omitted} section(s) omitted to keep this report under ${Math.round(maxBytes / 1000)} KB. The full findings are in \`drift-output/types-report.json\`.\n`;
  }
  return `${body}\n${footer}\n`;
}

/** Console summary: one line per marketplace, one for the finding kinds, one for the overlay. */
export function typesSummaryLines(report: TypesReport): string[] {
  const lines = report.marketplaces.map(
    (m) =>
      `${m.marketplace}: ${m.entries.length} map entr${m.entries.length === 1 ? 'y' : 'ies'}, ${m.types} SDK type(s) covered — ${m.counts.warning} warning / ${m.counts.info} info`,
  );
  const kinds = KIND_ORDER.filter((k) => report.kinds[k]).map((k) => `${k} ${report.kinds[k]}`);
  lines.push(`findings: ${kinds.join(', ') || 'none'}`);
  if (report.known) {
    const k = report.known;
    lines.push(
      `known discrepancies (${k.source}): ${k.accepted} SDK-type finding(s) accepted by ${k.entries} entr${k.entries === 1 ? 'y' : 'ies'}${k.stale.length ? `, ${k.stale.length} stale` : ''}`,
    );
  }
  return lines;
}
