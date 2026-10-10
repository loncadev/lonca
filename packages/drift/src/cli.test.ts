/**
 * End-to-end: the CLI against a fixture snapshot and the REAL `specs/trendyol/*.json`.
 * No network, no credentials.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from './cli.js';
import type { Finding } from './engine.js';
import type { DriftReport } from './report.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));

let outDir: string;
let logs: string[];
let errors: string[];
let io: CliIo;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'lonca-drift-'));
  logs = [];
  errors = [];
  io = { cwd: REPO, log: (l) => logs.push(l), error: (l) => errors.push(l) };
});
afterEach(() => rmSync(outDir, { recursive: true, force: true }));

function cli(...args: string[]): number {
  return runCli(['--out-dir', outDir, '--specs-dir', join(REPO, 'specs'), ...args], io);
}

function readReport(): { json: DriftReport; md: string } {
  return {
    json: JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as DriftReport,
    md: readFileSync(join(outDir, 'report.md'), 'utf8'),
  };
}

describe('pnpm drift — fixture snapshot vs real specs/trendyol', () => {
  const fixture = () => cli('--snapshots-dir', join(FIXTURES, 'snapshots'));

  it('finds the documented contradictions as known, and the injected drift as breaking / additive / warning', () => {
    expect(fixture()).toBe(1);
    const { json } = readReport();
    const [ty] = json.marketplaces;
    expect(ty).toMatchObject({
      marketplace: 'trendyol',
      env: 'prod',
      wireBaseline: true,
      probesWithoutWire: ['webhooks.list'],
    });

    const orders = ty!.operations.find((op) => op.operationId === 'getShipmentPackages')!;
    expect(orders).toMatchObject({
      key: 'GET /integration/order/sellers/{sellerId}/orders',
      spec: 'trendyol/marketplace.json',
      status: 200,
      probes: ['orders.list'],
    });
    const by = (kind: Finding['kind']) =>
      orders.findings.filter((f) => f.kind === kind).map((f) => f.path);

    // Injected: customerId is documented as integer → breaking.
    expect(orders.findings.filter((f) => f.severity === 'breaking')).toEqual([
      expect.objectContaining({
        kind: 'type-mismatch',
        path: 'content[].customerId',
        observed: ['string'],
        documented: ['number'],
      }),
    ]);
    // Injected: a key ShipmentPackage does not document → additive.
    expect(by('undocumented-field')).toEqual(['content[].fixtureUndocumentedField']);
    // Real annotations in specs/trendyol/marketplace.json explain these → info, not breaking.
    expect(by('known')).toEqual([
      'content[].cargoTrackingNumber', // x-lonca-observed-types: ["number"]
      'content[].orderDate', // x-lonca-observed
      'content[].packageHistories', // x-lonca-observed
      'content[].shipmentNumber', // x-lonca-observed-types: ["number"]
      'content[].taxNumber', // x-lonca-observed-types: ["null"]
    ]);
    // Empty array and depth cap are not reported as missing fields.
    expect(by('uncomparable')).toEqual(['content[].lines[]', 'content[].shipmentAddress']);
    expect(by('missing-required')).toEqual([]);
    const notObserved = orders.findings.filter((f) => f.kind === 'not-observed');
    expect(notObserved).toHaveLength(1);
    expect(notObserved[0]!.path).toBe('content[]');
    expect(notObserved[0]!.fields).toContain('cargoProviderName');
    expect(notObserved[0]!.fields).not.toContain('shipmentNumber');
    expect(orders.counts).toMatchObject({ breaking: 1, additive: 1, warning: 0 });

    const unmatched = ty!.operations.find((op) => op.unmatched)!;
    expect(unmatched).toMatchObject({
      key: 'GET apigw.trendyol.com/integration/fixture-only/{}',
      host: 'apigw.trendyol.com',
      probes: ['fixture.unmatched'],
    });
    expect(unmatched.findings).toEqual([
      expect.objectContaining({ kind: 'unmatched-operation', severity: 'warning' }),
    ]);

    expect(json.counts).toMatchObject({ breaking: 1, additive: 1, warning: 1 });
    expect(logs.join('\n')).toContain('1 breaking / 1 additive / 1 warning');
    expect(logs.at(-1)).toContain('at or above "breaking"');
  });

  it('renders an issue-ready Markdown report', () => {
    fixture();
    const { md } = readReport();
    expect(md).toContain('| trendyol | prod | 2 | 1 | 1 | 1 |');
    expect(md).toContain('### `GET /integration/order/sellers/{sellerId}/orders` → 200');
    expect(md).toContain(
      '`trendyol/marketplace.json` · `getShipmentPackages` · probes: `orders.list`',
    );
    expect(md).toContain('**Breaking (1)**');
    expect(md).toContain(
      '- `type-mismatch` `content[].customerId`: observed string where number is documented',
    );
    expect(md).toContain('**Additive (1)**');
    expect(md).toContain('**Warning (1)**');
    expect(md).toMatch(/<details><summary>Info \(\d+\)<\/summary>/);
    expect(md).toMatch(
      /`not-observed`: \d+ optional documented properties not seen in this sample, across 1 object\(s\)/,
    );
    expect(md).toContain('Probes without wire data (not compared): `webhooks.list`.');
    expect(md).toContain('## How to act');
    expect(Buffer.byteLength(md)).toBeLessThan(60_000);
  });

  it('honours --fail-on', () => {
    expect(fixture()).toBe(1);
    expect(cli('--snapshots-dir', join(FIXTURES, 'snapshots'), '--fail-on', 'additive')).toBe(1);
    expect(cli('--snapshots-dir', join(FIXTURES, 'snapshots'), '--fail-on', 'never')).toBe(0);
    expect(logs.at(-1)).toContain('--fail-on never');
  });

  it('honours --only', () => {
    expect(cli('--snapshots-dir', join(FIXTURES, 'snapshots'), '--only', 'trendyol')).toBe(1);
    expect(cli('--snapshots-dir', join(FIXTURES, 'snapshots'), '--only', 'n11')).toBe(2);
    expect(errors.join('\n')).toContain('Known marketplaces: trendyol');
  });
});

describe('pnpm drift — known-discrepancy overlay', () => {
  const ORDERS = 'GET /integration/order/sellers/{sellerId}/orders';
  const accepting = {
    marketplace: 'trendyol',
    operation: ORDERS,
    path: 'content[].customerId',
    kind: 'type-mismatch',
    reason: 'fixture: prod sends a string id',
    since: '2026-10-09',
  };
  const stale = { ...accepting, path: 'content[].gone', reason: 'fixture: no longer seen' };
  const overlay = (entries: unknown[], name = 'overlay.json'): string => {
    const file = join(outDir, name);
    writeFileSync(file, JSON.stringify({ $comment: 'test', entries }));
    return file;
  };
  const snapshots = join(FIXTURES, 'snapshots');

  it('accepts a listed finding (exit 0) and reports stale entries', () => {
    expect(cli('--snapshots-dir', snapshots, '--known', overlay([accepting, stale]))).toBe(0);
    const { json, md } = readReport();
    const orders = json.marketplaces[0]!.operations.find((op) => op.key === ORDERS)!;
    expect(orders.findings.filter((f) => f.kind === 'accepted')).toEqual([
      expect.objectContaining({
        severity: 'info',
        path: 'content[].customerId',
        accepts: 'type-mismatch',
        reason: 'fixture: prod sends a string id',
      }),
    ]);
    expect(json.counts.breaking).toBe(0);
    expect(json.known).toMatchObject({ entries: 2, accepted: 1, stale: [stale] });
    expect(md).toContain('Known-discrepancy overlay');
    expect(md).toContain('2 entries, 1 finding(s) accepted, 1 stale.');
    expect(md).toContain('### Stale overlay entries');
    expect(md).toContain(
      `- trendyol \`${ORDERS}\` \`content[].gone\` \`type-mismatch\` (since 2026-10-09): fixture: no longer seen`,
    );
    expect(md).toContain(
      '- `accepted` `content[].customerId` (was `type-mismatch`): observed string where number is documented — fixture: prod sends a string id',
    );
    expect(logs.join('\n')).toContain('(1 accepted)');
    expect(logs.join('\n')).toContain(
      '1 finding(s) accepted by 2 entries, 1 stale entry (see report.md)',
    );
  });

  it('reads <snapshots-dir>/known-discrepancies.json by default and never parses it as a snapshot', () => {
    const dir = join(outDir, 'snaps');
    mkdirSync(dir);
    copyFileSync(join(snapshots, 'trendyol.json'), join(dir, 'trendyol.json'));
    writeFileSync(join(dir, 'known-discrepancies.json'), JSON.stringify({ entries: [accepting] }));
    expect(cli('--snapshots-dir', dir)).toBe(0);
    const { json } = readReport();
    expect(json.marketplaces.map((m) => m.marketplace)).toEqual(['trendyol']);
    expect(json.known).toMatchObject({ entries: 1, accepted: 1, stale: [] });
    expect(logs.join('\n')).toContain('1 finding(s) accepted by 1 entry');

    // --no-known ignores it
    expect(cli('--snapshots-dir', dir, '--no-known')).toBe(1);
    expect(readReport().json.known).toBeUndefined();
  });

  it('runs without an overlay when the default file is absent', () => {
    expect(cli('--snapshots-dir', snapshots)).toBe(1);
    expect(readReport().json.known).toBeUndefined();
  });

  it('exits 2 on a missing, invalid or conflicting overlay', () => {
    expect(cli('--snapshots-dir', snapshots, '--known', join(outDir, 'none.json'))).toBe(2);
    expect(errors.join('\n')).toContain('none.json: file not found');
    expect(
      cli('--snapshots-dir', snapshots, '--known', overlay([{ ...accepting, kind: 'known' }])),
    ).toBe(2);
    expect(errors.join('\n')).toContain('entries[0].kind: "known" is not one of');
    expect(cli('--snapshots-dir', snapshots, '--known', 'x.json', '--no-known')).toBe(2);
    expect(errors.join('\n')).toContain('--known and --no-known are mutually exclusive');
  });
});

describe('pnpm drift — no wire baseline yet', () => {
  it('exits 0 with a clear message when the snapshots predate wire capture', () => {
    expect(cli('--snapshots-dir', join(FIXTURES, 'legacy-snapshots'))).toBe(0);
    expect(logs.join('\n')).toContain(
      'hepsiburada: no wire baseline — run `pnpm probe` to capture',
    );
    expect(logs.at(-1)).toContain('No wire baseline in the selected snapshots yet');
    const { json, md } = readReport();
    expect(json.wireBaseline).toBe(false);
    expect(md).toContain('| hepsiburada | prod | no wire baseline |');
    expect(md).toContain(
      'No wire baseline: this snapshot was captured before wire recording existed.',
    );
  });

  it('exits 0 regardless of --fail-on', () => {
    expect(
      cli('--snapshots-dir', join(FIXTURES, 'legacy-snapshots'), '--fail-on', 'additive'),
    ).toBe(0);
  });
});

describe('pnpm drift — usage errors', () => {
  it('prints help', () => {
    expect(runCli(['--help'], io)).toBe(0);
    expect(logs[0]).toContain('Usage: pnpm drift');
  });

  it('accepts a leading `--` (pnpm 11 forwards it from `pnpm drift -- --flag`)', () => {
    expect(runCli(['--', '--help'], io)).toBe(0);
  });

  it('rejects unknown flags and bad --fail-on values with exit 2', () => {
    expect(runCli(['--nope'], io)).toBe(2);
    expect(runCli(['--fail-on', 'sometimes'], io)).toBe(2);
    expect(errors.join('\n')).toContain('--fail-on must be one of breaking, additive, never');
  });

  it('exits 2 when an input directory is missing or unreadable', () => {
    expect(cli('--snapshots-dir', join(FIXTURES, 'does-not-exist'))).toBe(2);
    expect(runCli(['--snapshots-dir', FIXTURES, '--specs-dir', join(FIXTURES, 'nope')], io)).toBe(
      2,
    );
    const broken = join(outDir, 'broken');
    mkdirSync(broken);
    writeFileSync(join(broken, 'trendyol.json'), '{ not json');
    expect(cli('--snapshots-dir', broken)).toBe(2);
    expect(errors.join('\n')).toContain('could not read probe snapshots');
  });
});
