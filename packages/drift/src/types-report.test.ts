import { describe, expect, it } from 'vitest';
import type { KnownDiscrepancy } from './known.js';
import type { SpecFile } from './openapi.js';
import type { ProbeSnapshot } from './report.js';
import type { Shape } from './shape.js';
import { sdkTypeKey, type SdkTypeNode } from './types-extract.js';
import type { SdkTypeMapEntry } from './types-map.js';
import {
  buildTypesReport,
  renderTypesMarkdown,
  shouldFailTypes,
  typesSummaryLines,
  type BuildTypesReportInput,
} from './types-report.js';

const json = (schema: unknown) => ({ content: { 'application/json': { schema } } });

const spec: SpecFile = {
  id: 'shop/items.json',
  marketplace: 'shop',
  document: {
    servers: [{ url: 'https://api.shop.test/v1' }],
    paths: {
      '/items': {
        get: {
          responses: {
            '200': json({
              type: 'object',
              properties: {
                total: { type: 'integer' },
                content: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'integer' }, name: { type: 'string' }, size: {} },
                  },
                },
              },
            }),
          },
        },
      },
      '/items/{id}': {
        post: {
          responses: { '201': json({ type: 'object', properties: { ok: { type: 'boolean' } } }) },
        },
      },
      '/text': { get: { responses: { '200': { description: 'plain text' } } } },
      '/nothing': { get: { responses: {} } },
    },
  },
};

const entry = (over: Partial<SdkTypeMapEntry> = {}): SdkTypeMapEntry => ({
  marketplace: 'shop',
  sdkType: 'WireItem',
  source: 'src/items.ts',
  spec: 'shop/items.json',
  operation: 'GET /v1/items',
  pointer: 'content[]',
  ...over,
});

const item: SdkTypeNode = {
  types: ['object'],
  name: 'WireItem',
  properties: {
    id: { optional: true, type: { types: ['string'] } },
    name: { optional: true, type: { types: ['string'] } },
    color: { optional: true, type: { types: ['string'] } },
    raw: { optional: false, type: { types: ['object'], indexSignature: true } },
  },
};
const result: SdkTypeNode = {
  types: ['object'],
  name: 'Result',
  properties: { ok: { optional: true, type: { types: ['boolean'] } } },
};

const nodes = new Map<string, SdkTypeNode>([
  [sdkTypeKey({ source: 'src/items.ts', name: 'WireItem' }), item],
  [sdkTypeKey({ source: 'src/items.ts', name: 'Result' }), result],
]);

const S = (types: Shape['types'], extra: Partial<Shape> = {}): Shape => ({ types, ...extra });
const wire = (key: string, shape: Shape | undefined, status = 200, spec = 'shop/items.json') => ({
  operation: { key, spec, method: 'GET', path: key.slice(4), specPath: '/items', server: 'x' },
  status,
  body: 'json' as const,
  ...(shape ? { shape } : {}),
});
const page = (keys: Record<string, Shape>): Shape =>
  S(['object'], { keys: { content: S(['array'], { items: S(['object'], { keys }) }) } });

const snapshots: ProbeSnapshot[] = [
  {
    marketplace: 'shop',
    probes: {
      'items.list': {
        status: 'ok',
        wire: [
          wire('GET /v1/items', page({ id: S(['number']) })),
          wire('GET /v1/items', page({ color: S(['string']) })),
          wire('GET /v1/items', undefined),
          wire('GET /v1/items', page({ name: S(['number']) }), 500),
          wire('GET /v1/items', page({ name: S(['number']) }), 200, 'other/spec.json'),
        ],
      },
      legacy: { status: 'ok' },
    },
  },
  {
    marketplace: 'elsewhere',
    probes: { x: { status: 'ok', wire: [wire('GET /v1/items', page({}))] } },
  },
];

function build(over: Partial<BuildTypesReportInput> = {}) {
  return buildTypesReport({
    entries: [entry({ ignore: ['raw'] })],
    nodes,
    specs: [spec],
    snapshots,
    ...over,
  });
}

describe('buildTypesReport', () => {
  it('compares a mapped type with the documented schema and the merged wire shape', () => {
    const { report, problems } = build({
      reached: new Map([
        [sdkTypeKey({ source: 'src/items.ts', name: 'WireItem' }), ['src/items.ts#WireItem']],
      ]),
    });
    expect(problems).toEqual([]);
    const [shop] = report.marketplaces;
    expect(shop).toMatchObject({ marketplace: 'shop', types: 1 });
    const e = shop!.entries[0]!;
    expect(e).toMatchObject({
      sdkType: 'WireItem',
      status: 200,
      compared: 2,
      wireBaseline: true,
      types: ['src/items.ts#WireItem'],
    });
    expect(e.findings.map((f) => `${f.kind}:${f.severity}@${f.path}`)).toEqual([
      'sdk-missing-field:info@content[]',
      'sdk-unknown-field:info@content[].color',
      'sdk-type-mismatch:warning@content[].id',
    ]);
    // 200 JSON exchanges of this spec only: the 500 and the other spec's exchange are not merged in
    expect(e.findings[2]!.wire).toEqual(['number']);
    expect(e.findings[0]!.fields).toEqual(['size']);
    expect(report.counts).toEqual({ breaking: 0, additive: 0, warning: 1, info: 2 });
    expect(report.kinds).toEqual({
      'sdk-missing-field': 1,
      'sdk-unknown-field': 1,
      'sdk-type-mismatch': 1,
    });
    expect(report.known).toBeUndefined();
  });

  it('uses the first documented 2xx when 200 is not documented, and copies the note', () => {
    const { report, problems } = build({
      entries: [
        entry({
          sdkType: 'Result',
          operation: 'POST /v1/items/{id}',
          pointer: '(root)',
          note: 'why',
        }),
      ],
    });
    expect(problems).toEqual([]);
    expect(report.marketplaces[0]!.entries[0]).toMatchObject({
      status: 201,
      note: 'why',
      wireBaseline: false,
      types: [],
      findings: [],
    });
  });

  it('returns entries that do not resolve as problems', () => {
    const { report, problems } = build({
      entries: [
        entry({ sdkType: 'Missing' }),
        entry({ spec: 'shop/none.json' }),
        entry({ operation: 'GET /v1/nope' }),
        entry({ operation: 'GET /v1/text' }),
        entry({ operation: 'GET /v1/nothing' }),
        entry({ pointer: 'content[].id.deeper' }),
      ],
    });
    expect(report.marketplaces).toEqual([]);
    expect(problems).toEqual([
      'entries[0] (Missing → GET /v1/items content[]): SDK type not extracted',
      'entries[1] (WireItem → GET /v1/items content[]): spec shop/none.json not found',
      'entries[2] (WireItem → GET /v1/nope content[]): shop/items.json documents no operation "GET /v1/nope"',
      'entries[3] (WireItem → GET /v1/text content[]): HTTP 200 documents no JSON body',
      'entries[4] (WireItem → GET /v1/nothing content[]): no documented response for HTTP 200',
      'entries[5] (WireItem → GET /v1/items content[].id.deeper): pointer "content[].id.deeper" leads nowhere in the documented response',
    ]);
  });

  it('applies the sdk-* overlay entries and reports the stale ones', () => {
    const accept = (over: Partial<KnownDiscrepancy>): KnownDiscrepancy => ({
      marketplace: 'shop',
      operation: 'GET /v1/items',
      path: 'content[].id',
      kind: 'sdk-type-mismatch',
      reason: 'ids are strings on this shop',
      since: '2026-10-10',
      ...over,
    });
    const overlay = [
      accept({}),
      accept({ path: 'content[].gone' }),
      accept({ marketplace: 'not-in-report' }),
      // wire-report kinds are left to `pnpm drift`
      accept({ kind: 'type-mismatch' }),
    ];
    const { report } = build({ overlay: { entries: overlay, source: 'k.json' } });
    const findings = report.marketplaces[0]!.entries[0]!.findings;
    expect(findings[2]).toMatchObject({
      kind: 'accepted',
      severity: 'info',
      accepts: 'sdk-type-mismatch',
      reason: 'ids are strings on this shop',
      sdkPath: 'WireItem.id',
    });
    expect(report.counts.warning).toBe(0);
    expect(report.kinds.accepted).toBe(1);
    expect(report.known).toEqual({
      source: 'k.json',
      entries: 3,
      accepted: 1,
      stale: [overlay[1]],
    });
  });
});

describe('shouldFailTypes / typesSummaryLines', () => {
  it('fails on warnings only with --fail-on warning', () => {
    const { report } = build();
    expect(shouldFailTypes(report, 'warning')).toBe(true);
    expect(shouldFailTypes(report, 'never')).toBe(false);
    const { report: clean } = build({ entries: [] });
    expect(shouldFailTypes(clean, 'warning')).toBe(false);
  });

  it('summarises per marketplace, per kind and the overlay', () => {
    const { report } = build({
      overlay: {
        entries: [
          {
            marketplace: 'shop',
            operation: 'GET /v1/x',
            path: '*',
            kind: 'sdk-unknown-field',
            reason: 'r',
            since: '2026-10-10',
          },
        ],
        source: 'k.json',
      },
    });
    expect(typesSummaryLines(report)).toEqual([
      'shop: 1 map entry, 0 SDK type(s) covered — 1 warning / 2 info',
      'findings: sdk-type-mismatch 1, sdk-unknown-field 1, sdk-missing-field 1',
      'known discrepancies (k.json): 0 SDK-type finding(s) accepted by 1 entry, 1 stale',
    ]);
    const { report: none } = build({ entries: [], overlay: { entries: [], source: 'k.json' } });
    expect(typesSummaryLines(none)).toEqual([
      'findings: none',
      'known discrepancies (k.json): 0 SDK-type finding(s) accepted by 0 entries',
    ]);
  });
});

describe('renderTypesMarkdown', () => {
  const two = (): BuildTypesReportInput['entries'] => [
    entry({ ignore: ['raw'], note: 'Mirrors the wire.' }),
    entry({ sdkType: 'Result', operation: 'POST /v1/items/{id}', pointer: '(root)' }),
  ];

  it('renders the counts, every entry with findings, the clean entries and the footer', () => {
    const overlay = {
      entries: [
        {
          marketplace: 'shop',
          operation: 'GET /v1/items',
          path: 'content[].color',
          kind: 'sdk-unknown-field' as const,
          reason: 'real but undocumented',
          since: '2026-10-10',
        },
      ],
      source: 'k.json',
    };
    const md = renderTypesMarkdown(build({ entries: two(), overlay }).report);
    expect(md).toContain('# SDK types vs specs');
    expect(md).toContain('| shop | 2 | 0 | 1 | 2 |');
    expect(md).toContain('| `sdk-type-mismatch` | 1 |');
    expect(md).toContain(
      'Known-discrepancy overlay `k.json`: 1 entry, 1 finding(s) accepted, 0 stale.',
    );
    expect(md).toContain('### `WireItem` → `GET /v1/items` · `content[]`');
    expect(md).toContain(
      '`src/items.ts` · `shop/items.json` (HTTP 200) · 2 properties compared · wire baseline: yes',
    );
    expect(md).toContain('> Mirrors the wire.');
    expect(md).toContain('**Warning (1)**');
    expect(md).toContain(
      '- `sdk-type-mismatch` `content[].id` (`WireItem.id`): SDK declares string where the spec documents number; wire baseline: number',
    );
    expect(md).toContain('<details><summary>Info (2)</summary>');
    expect(md).toContain(
      '- `accepted` `content[].color` (`WireItem.color`) (was `sdk-unknown-field`): ',
    );
    expect(md).toContain(
      '- `sdk-missing-field`: 1 documented property the SDK type does not declare, across 1 object(s)',
    );
    expect(md).toContain('Entries with no findings: `Result` (`POST /v1/items/{id}` `(root)`).');
    expect(md).toContain('## How to act');
  });

  it('renders root findings and plural counts', () => {
    const wide: SdkTypeNode = {
      types: ['array', 'object'],
      name: 'Root',
      items: { types: ['any'] },
    };
    const { report } = build({
      entries: [entry({ sdkType: 'Root', pointer: '(root)' })],
      nodes: new Map([[sdkTypeKey({ source: 'src/items.ts', name: 'Root' }), wide]]),
    });
    const md = renderTypesMarkdown(report);
    expect(md).toContain('- `sdk-type-mismatch` `(root)` (`Root`): SDK declares array|object');
    expect(md).toContain('0 properties compared');
  });

  it('truncates whole sections to fit the byte cap', () => {
    const md = renderTypesMarkdown(build({ entries: two() }).report, 1500);
    expect(md).toContain('> **Truncated:**');
    expect(md).toContain('drift-output/types-report.json');
    expect(md).toContain('## How to act');
  });
});
