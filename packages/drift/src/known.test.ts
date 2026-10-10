import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finding } from './engine.js';
import {
  applyKnownDiscrepancies,
  createOverlayMatcher,
  KnownDiscrepanciesError,
  loadKnownDiscrepancies,
  overlayScopeOf,
  parseKnownDiscrepancies,
  type KnownDiscrepancy,
} from './known.js';
import { countFindings, emptyCounts, type DriftReport, type OperationReport } from './report.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const entry = (over: Partial<KnownDiscrepancy> = {}): KnownDiscrepancy => ({
  marketplace: 'shop',
  operation: 'GET /items',
  path: '(root)',
  kind: 'type-mismatch',
  reason: 'docs are wrong; the SDK copes',
  since: '2026-10-09',
  ...over,
});

function problems(value: unknown): string {
  try {
    parseKnownDiscrepancies(value, 'overlay.json');
  } catch (err) {
    expect(err).toBeInstanceOf(KnownDiscrepanciesError);
    return (err as Error).message;
  }
  throw new Error('expected parseKnownDiscrepancies to throw');
}

describe('parseKnownDiscrepancies', () => {
  it('returns the entries of a valid overlay', () => {
    const e = entry();
    expect(parseKnownDiscrepancies({ $comment: 'why', entries: [e] }, 'x')).toEqual([e]);
    expect(parseKnownDiscrepancies({ entries: [] }, 'x')).toEqual([]);
  });

  it('rejects a document that is not an object with an entries array', () => {
    expect(problems([])).toBe(
      'overlay.json: expected an object with an "entries" array, got an array',
    );
    expect(problems(null)).toContain('got null');
    expect(problems('x')).toContain('got a string');
    expect(problems({})).toContain('"entries" must be an array, got nothing');
  });

  it('lists every problem with its location', () => {
    const message = problems({
      $comment: 3,
      extra: true,
      entries: [
        entry(),
        'nope',
        { ...entry(), kind: 'known', since: '09.10.2026', note: 'x' },
        { marketplace: 'shop', operation: ' ', path: '*', kind: 'undocumented-null' },
        { ...entry(), since: '' },
        { ...entry(), since: '2026-13-45' },
        entry(),
      ],
    });
    expect(message.split('\n')).toEqual([
      'overlay.json: invalid known-discrepancy overlay',
      '  - unknown top-level key "extra"',
      '  - "$comment" must be a string',
      '  - entries[1]: expected an object, got a string',
      '  - entries[2]: unknown key "note"',
      '  - entries[2].kind: "known" is not one of type-mismatch, missing-required, undocumented-field, undocumented-null, unmatched-operation, sdk-type-mismatch, sdk-unknown-field',
      '  - entries[2].since: "09.10.2026" is not a YYYY-MM-DD date',
      '  - entries[3].operation: required, must be a non-empty string',
      '  - entries[3].reason: required, must be a non-empty string',
      '  - entries[3].since: required, must be a non-empty string',
      '  - entries[4].since: required, must be a non-empty string',
      '  - entries[5].since: "2026-13-45" is not a YYYY-MM-DD date',
      '  - entries[6]: duplicate of entries[0] (same marketplace, operation, path, kind)',
    ]);
  });
});

describe('loadKnownDiscrepancies', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lonca-known-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a file, and treats a missing optional file as "no overlay"', () => {
    const file = join(dir, 'k.json');
    writeFileSync(file, JSON.stringify({ entries: [entry()] }));
    expect(loadKnownDiscrepancies(file)).toEqual([entry()]);
    expect(loadKnownDiscrepancies(join(dir, 'none.json'), { optional: true })).toBeUndefined();
    expect(() => loadKnownDiscrepancies(join(dir, 'none.json'))).toThrow(
      /none\.json: file not found/,
    );
  });

  it('reports invalid JSON with the file name', () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{ entries: ');
    expect(() => loadKnownDiscrepancies(file)).toThrow(/bad\.json: not valid JSON/);
  });

  it('accepts the committed probe-snapshots/known-discrepancies.json', () => {
    const entries = loadKnownDiscrepancies(join(REPO, 'probe-snapshots/known-discrepancies.json'));
    expect(entries!.length).toBeGreaterThan(0);
  });
});

function op(key: string, findings: OperationReport['findings']): OperationReport {
  return {
    key,
    method: 'GET',
    path: key.slice(4),
    status: 200,
    probes: ['p'],
    findings,
    counts: countFindings(findings),
  };
}

function report(...marketplaces: [string, OperationReport[]][]): DriftReport {
  const ms = marketplaces.map(([marketplace, operations]) => {
    const counts = emptyCounts();
    for (const o of operations) for (const f of o.findings) counts[f.severity] += 1;
    return { marketplace, wireBaseline: true, probesWithoutWire: [], operations, counts };
  });
  const counts = emptyCounts();
  for (const m of ms)
    for (const s of Object.keys(counts) as (keyof typeof counts)[]) counts[s] += m.counts[s];
  return { marketplaces: ms, counts, wireBaseline: true };
}

describe('applyKnownDiscrepancies', () => {
  const mismatch = finding('type-mismatch', '', 'observed object where array is documented', {
    observed: ['object'],
    documented: ['array'],
  });
  const nullField = finding('undocumented-null', 'a.b', 'observed null where string is documented');
  const extra = finding('undocumented-field', 'x', 'observed string, not in the schema');

  it('downgrades matching findings to accepted and recomputes every count', () => {
    const input = report(
      ['shop', [op('GET /items', [mismatch, nullField, extra])]],
      ['other', [op('GET /items', [mismatch])]],
    );
    const out = applyKnownDiscrepancies(
      input,
      [entry(), entry({ path: 'a.b', kind: 'undocumented-null', reason: 'spec lacks nullable' })],
      'overlay.json',
    );
    const [shop, other] = out.marketplaces;
    expect(shop!.operations[0]!.findings).toEqual([
      {
        kind: 'accepted',
        severity: 'info',
        path: '',
        message: 'observed object where array is documented',
        observed: ['object'],
        documented: ['array'],
        accepts: 'type-mismatch',
        reason: 'docs are wrong; the SDK copes',
        since: '2026-10-09',
      },
      expect.objectContaining({ kind: 'accepted', accepts: 'undocumented-null', path: 'a.b' }),
      extra,
    ]);
    expect(shop!.operations[0]!.counts).toEqual({ breaking: 0, additive: 1, warning: 0, info: 2 });
    expect(shop!.counts).toEqual({ breaking: 0, additive: 1, warning: 0, info: 2 });
    // the entry is scoped to its marketplace
    expect(other!.operations[0]!.findings).toEqual([mismatch]);
    expect(out.counts).toEqual({ breaking: 1, additive: 1, warning: 0, info: 2 });
    expect(out.known).toEqual({ source: 'overlay.json', entries: 2, accepted: 2, stale: [] });
    // the input report is untouched
    expect(input.marketplaces[0]!.operations[0]!.findings[0]).toBe(mismatch);
    expect(input.known).toBeUndefined();
  });

  it('matches "*" against any path of the operation, but only the given kind', () => {
    const out = applyKnownDiscrepancies(
      report(['shop', [op('GET /items', [mismatch, nullField, extra])]]),
      [entry({ path: '*', kind: 'undocumented-field' })],
      'k',
    );
    expect(out.marketplaces[0]!.operations[0]!.findings.map((f) => f.kind)).toEqual([
      'type-mismatch',
      'undocumented-null',
      'accepted',
    ]);
  });

  it('lists entries that matched nothing as stale, ignoring marketplaces not in the report', () => {
    const stale = [
      entry({ operation: 'GET /gone' }),
      entry({ path: 'nope' }),
      entry({ kind: 'missing-required' }),
    ];
    const out = applyKnownDiscrepancies(
      report(['shop', [op('GET /items', [mismatch])]]),
      [...stale, entry(), entry({ marketplace: 'not-selected' })],
      'k',
    );
    expect(out.known).toEqual({ source: 'k', entries: 5, accepted: 1, stale });
  });
});

describe('overlay scopes (wire report vs SDK-types report)', () => {
  it('accepts sdk-* kinds and keeps them out of the wire report', () => {
    const sdkEntry = entry({ kind: 'sdk-unknown-field', path: 'x' });
    expect(parseKnownDiscrepancies({ entries: [sdkEntry] }, 'k')).toEqual([sdkEntry]);
    expect(overlayScopeOf('sdk-type-mismatch')).toBe('sdk-types');
    expect(overlayScopeOf('undocumented-field')).toBe('wire');

    const wireOnly = finding('undocumented-field', 'x', 'observed string, not in the schema');
    const out = applyKnownDiscrepancies(
      report(['shop', [op('GET /items', [wireOnly])]]),
      [sdkEntry],
      'k',
    );
    // the sdk-* entry neither matches a wire finding nor counts as a stale wire entry
    expect(out.marketplaces[0]!.operations[0]!.findings).toEqual([wireOnly]);
    expect(out.known).toEqual({ source: 'k', entries: 0, accepted: 0, stale: [] });
  });

  it('matches SDK-type findings by marketplace, operation, path and kind', () => {
    const matcher = createOverlayMatcher(
      [entry({ kind: 'sdk-type-mismatch', path: 'a' }), entry({ kind: 'type-mismatch' })],
      'sdk-types',
    );
    const hit = finding('sdk-type-mismatch', 'a', 'SDK declares string', { sdkPath: 'T.a' });
    expect(matcher.accept('shop', 'GET /items', hit)).toMatchObject({
      kind: 'accepted',
      accepts: 'sdk-type-mismatch',
      sdkPath: 'T.a',
    });
    expect(matcher.accept('other', 'GET /items', hit)).toBe(hit);
    expect(matcher.accept('shop', 'GET /other', hit)).toBe(hit);
    expect(matcher.summary('k', ['shop'])).toEqual({
      source: 'k',
      entries: 1,
      accepted: 1,
      stale: [],
    });
  });
});
