import { describe, expect, it } from 'vitest';
import type { SpecFile } from './openapi.js';
import type { MatchedOperation } from './operations.js';
import {
  buildDriftReport,
  MAX_MARKDOWN_BYTES,
  renderMarkdown,
  shouldFail,
  type DriftReport,
  type ProbeSnapshot,
} from './report.js';
import type { WireExchange } from './wire.js';

const SPEC: SpecFile = {
  id: 'shop/api.json',
  marketplace: 'shop',
  document: {
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/items': {
        get: {
          operationId: 'listItems',
          responses: {
            '200': { $ref: '#/components/responses/Items' },
            '404': { description: 'not found' },
          },
        },
      },
      '/ping': {
        get: {
          operationId: 'ping',
          responses: { '2XX': { description: 'pong', content: { 'text/plain': {} } } },
        },
      },
      '/noschema': { get: { responses: { '200': { description: 'x', content: { '*/*': {} } } } } },
      '/vendor': {
        get: {
          responses: {
            '200': {
              description: 'x',
              content: {
                'application/vnd.shop+json;version=2': {
                  schema: { type: 'object', properties: { a: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
      '/badref': { get: { responses: { '200': { $ref: '#/components/responses/Nope' } } } },
    },
    components: {
      responses: {
        Items: {
          description: 'ok',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: { items: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
};

function op(path: string, over: Partial<MatchedOperation> = {}): MatchedOperation {
  return {
    key: `GET ${path}`,
    spec: 'shop/api.json',
    method: 'GET',
    path,
    specPath: path,
    server: 'https://api.example.com',
    ...over,
  };
}

function snapshot(probes: Record<string, WireExchange[] | undefined>, env = 'prod'): ProbeSnapshot {
  return {
    marketplace: 'shop',
    env,
    probes: Object.fromEntries(
      Object.entries(probes).map(([name, wire]) => [
        name,
        wire ? { status: 'ok', wire } : { status: 'ok' },
      ]),
    ),
  };
}

const itemsOk: WireExchange = {
  operation: op('/items', { operationId: 'listItems' }),
  status: 200,
  body: 'json',
  shape: { types: ['object'], keys: { items: { types: ['array'], items: { types: ['string'] } } } },
};

describe('buildDriftReport', () => {
  it('compares each wire operation with its documented schema', () => {
    const report = buildDriftReport([snapshot({ 'items.list': [itemsOk] })], [SPEC]);
    expect(report.wireBaseline).toBe(true);
    expect(report.marketplaces[0]!.operations).toEqual([
      expect.objectContaining({
        key: 'GET /items',
        operationId: 'listItems',
        spec: 'shop/api.json',
        probes: ['items.list'],
        findings: [],
      }),
    ]);
    expect(shouldFail(report, 'breaking')).toBe(false);
  });

  it('merges the same operation seen by several probes', () => {
    const extra: WireExchange = {
      ...itemsOk,
      shape: { types: ['object'], keys: { total: { types: ['number'] } } },
    };
    const noShape: WireExchange = { ...itemsOk, body: 'non-json', shape: undefined };
    const report = buildDriftReport([snapshot({ a: [itemsOk], b: [extra], c: [noShape] })], [SPEC]);
    const [operation] = report.marketplaces[0]!.operations;
    expect(operation!.probes).toEqual(['a', 'b', 'c']);
    expect(operation!.findings.map((f) => `${f.kind}@${f.path}`)).toEqual([
      'uncomparable@',
      'undocumented-field@total',
    ]);
    expect(operation!.findings[0]!.message).toContain('json, non-json');
  });

  it('reports why an exchange could not be compared', () => {
    const report = buildDriftReport(
      [
        snapshot({
          notFound: [{ ...itemsOk, status: 404, body: 'not-recorded', shape: undefined }],
          html: [
            {
              operation: op('/ping', { operationId: 'ping' }),
              status: 200,
              body: 'non-json',
              contentType: 'text/html',
            },
          ],
          ping: [
            {
              operation: op('/ping', { operationId: 'ping' }),
              status: 201,
              body: 'json',
              shape: { types: ['string'] },
            },
          ],
          noschema: [
            {
              operation: op('/noschema'),
              status: 200,
              body: 'json',
              shape: { types: ['object'], keys: {} },
            },
          ],
          badref: [
            {
              operation: op('/badref'),
              status: 200,
              body: 'json',
              shape: { types: ['object'], keys: {} },
            },
          ],
          undocumentedStatus: [{ ...itemsOk, status: 203 }],
          gone: [{ ...itemsOk, operation: op('/removed') }],
          otherSpec: [{ ...itemsOk, operation: op('/items', { spec: 'shop/missing.json' }) }],
          vendor: [
            {
              operation: op('/vendor'),
              status: 200,
              body: 'json',
              shape: { types: ['object'], keys: { a: { types: ['number'] } } },
            },
          ],
        }),
      ],
      [SPEC],
    );
    const messages = Object.fromEntries(
      report.marketplaces[0]!.operations.map((o) => [
        `${o.path} ${o.status}`,
        o.findings.map((f) => `${f.kind}: ${f.message}`),
      ]),
    );
    expect(messages).toEqual({
      '/badref 200': ['uncomparable: unresolvable response $ref #/components/responses/Nope'],
      '/items 200': [
        'unmatched-operation: shop/missing.json no longer documents GET /items (the spec changed since the snapshot was taken)',
      ],
      '/items 203': ['uncomparable: no documented response for HTTP 203'],
      '/items 404': ['uncomparable: HTTP 404: error bodies are not recorded, nothing to compare'],
      '/noschema 200': ['uncomparable: HTTP 200 */* has no schema'],
      '/ping 200': ['uncomparable: response body was non-json (text/html), not JSON'],
      '/ping 201': ['uncomparable: HTTP 2XX documents no JSON body (only text/plain)'],
      '/removed 200': [
        'unmatched-operation: shop/api.json no longer documents GET /removed (the spec changed since the snapshot was taken)',
      ],
      '/vendor 200': ['type-mismatch: observed number where string is documented'],
    });
    expect(report.counts).toEqual({ breaking: 1, additive: 0, warning: 2, info: 6 });
  });

  it('flags responses documented without any content', () => {
    const report = buildDriftReport(
      [snapshot({ p: [{ ...itemsOk, operation: op('/items'), status: 200 }] })],
      [
        {
          ...SPEC,
          document: {
            ...SPEC.document,
            paths: { '/items': { get: { responses: { '200': { description: 'ok' } } } } },
          },
        },
      ],
    );
    expect(report.marketplaces[0]!.operations[0]!.findings[0]!.message).toBe(
      'HTTP 200 documents no JSON body',
    );
  });

  it('separates probes without wire data and marketplaces without any', () => {
    const report = buildDriftReport(
      [
        snapshot({ withWire: [itemsOk], legacy: undefined }),
        { marketplace: 'old', probes: { x: { status: 'ok' } } },
      ],
      [SPEC],
    );
    expect(
      report.marketplaces.map((m) => [m.marketplace, m.wireBaseline, m.probesWithoutWire]),
    ).toEqual([
      ['old', false, ['x']],
      ['shop', true, ['legacy']],
    ]);
  });
});

describe('shouldFail', () => {
  const counts = (breaking: number, additive: number): DriftReport => ({
    marketplaces: [],
    wireBaseline: true,
    counts: { breaking, additive, warning: 5, info: 5 },
  });

  it.each([
    ['breaking', 1, 0, true],
    ['breaking', 0, 3, false],
    ['additive', 0, 3, true],
    ['additive', 0, 0, false],
    ['never', 9, 9, false],
  ] as const)('--fail-on %s with %i breaking / %i additive → %s', (failOn, b, a, expected) => {
    expect(shouldFail(counts(b, a), failOn)).toBe(expected);
  });
});

describe('renderMarkdown', () => {
  it('lists clean operations compactly and shows "-" for an unknown env', () => {
    const report = buildDriftReport([{ ...snapshot({ p: [itemsOk] }), env: undefined }], [SPEC]);
    const md = renderMarkdown(report);
    expect(md).toContain('| shop | - | 1 | 0 | 0 | 0 | 0 |');
    expect(md).toContain('## shop\n');
    expect(md).toContain('Operations with no findings: `GET /items` → 200.');
  });

  it('truncates to the byte budget with a note pointing at report.json', () => {
    const wire: WireExchange[] = Array.from({ length: 400 }, (_, i) => ({
      operation: {
        key: `GET h/op${i}/{}`,
        unmatched: true as const,
        method: 'GET',
        host: 'h',
        path: `/op${i}/{}`,
      },
      status: 200,
      body: 'json' as const,
      shape: { types: ['object' as const], keys: {} },
    }));
    const report = buildDriftReport([snapshot({ many: wire })], [SPEC]);
    const md = renderMarkdown(report);
    expect(Buffer.byteLength(md)).toBeLessThanOrEqual(MAX_MARKDOWN_BYTES);
    expect(md).toMatch(
      /> \*\*Truncated:\*\* \d+ section\(s\) omitted to keep this report under 60 KB/,
    );
    expect(md).toContain('drift-output/report.json');
    expect(md.trimEnd().endsWith('re-run `pnpm drift`.')).toBe(true);

    const small = renderMarkdown(report, 3_000);
    expect(Buffer.byteLength(small)).toBeLessThanOrEqual(3_000);
    expect(small).toContain('under 3 KB');
  });

  it('uses the singular for a single not-observed property', () => {
    const report = buildDriftReport(
      [
        snapshot({
          p: [{ ...itemsOk, operation: op('/vendor'), shape: { types: ['object'], keys: {} } }],
        }),
      ],
      [SPEC],
    );
    expect(renderMarkdown(report)).toContain('1 optional documented property not seen');
  });
});
