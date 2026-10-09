import { fileURLToPath } from 'node:url';
import { createTrendyolClient } from '@lonca/trendyol';
import { describe, expect, it, vi } from 'vitest';
import { loadSpecs, type SpecFile } from './openapi.js';
import { buildOperationIndex } from './operations.js';
import {
  collapseExchanges,
  createWireRecorder,
  diffWire,
  withGlobalFetch,
  type WireExchange,
} from './wire.js';

const SPECS: SpecFile[] = [
  {
    id: 'shop/orders.json',
    marketplace: 'shop',
    document: {
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/sellers/{sellerId}/orders': { get: { operationId: 'listOrders', responses: {} } },
        '/sellers/{sellerId}/brands': { get: { operationId: 'listBrands', responses: {} } },
      },
    },
  },
];
const index = buildOperationIndex(SPECS);
const ORDERS = 'https://api.example.com/v1/sellers/42/orders?page=0';

function json(
  body: unknown,
  status = 200,
  contentType = 'application/json; charset=utf-8',
): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

/** A fake fetch that answers each call with the next response factory. */
function fakeFetch(...responses: (() => Response)[]): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return next();
  }) as unknown as typeof fetch;
}

describe('createWireRecorder', () => {
  it('records the matched operation, status, media type and body shape — and the caller still reads the body', async () => {
    const recorder = createWireRecorder({
      index,
      fetch: fakeFetch(() => json({ content: [{ id: 1, customerName: 'Ayşe Yılmaz' }], page: 0 })),
    });
    const res = await recorder.fetch(ORDERS, { method: 'GET' });
    expect(await res.json()).toEqual({
      content: [{ id: 1, customerName: 'Ayşe Yılmaz' }],
      page: 0,
    });

    const wire = await recorder.take();
    expect(wire).toEqual([
      {
        operation: {
          key: 'GET /v1/sellers/{sellerId}/orders',
          spec: 'shop/orders.json',
          operationId: 'listOrders',
          method: 'GET',
          path: '/v1/sellers/{sellerId}/orders',
          specPath: '/sellers/{sellerId}/orders',
          server: 'https://api.example.com/v1',
        },
        status: 200,
        contentType: 'application/json',
        body: 'json',
        shape: {
          types: ['object'],
          keys: {
            content: {
              types: ['array'],
              items: {
                types: ['object'],
                keys: { customerName: { types: ['string'] }, id: { types: ['number'] } },
              },
            },
            page: { types: ['number'] },
          },
        },
      },
    ]);
    // Never a value, an id or a query string.
    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain('Ayşe');
    expect(serialized).not.toContain('/42/');
    expect(serialized).not.toContain('page=0');
  });

  it('takes the method from a Request input and defaults to GET', async () => {
    const recorder = createWireRecorder({ index, fetch: fakeFetch(() => json({})) });
    await recorder.fetch(new Request(ORDERS, { method: 'POST' }));
    await recorder.fetch(new URL(ORDERS));
    const wire = await recorder.take();
    expect(wire.map((x) => x.operation.key)).toEqual([
      'GET /v1/sellers/{sellerId}/orders',
      'POST api.example.com/v1/sellers/{}/orders',
    ]);
  });

  it('flags non-JSON and empty 2xx bodies instead of summarising them', async () => {
    const recorder = createWireRecorder({
      index,
      fetch: fakeFetch(
        () =>
          new Response('<html>blocked</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        () => new Response(null, { status: 204 }),
      ),
    });
    await recorder.fetch(ORDERS);
    await recorder.fetch('https://api.example.com/v1/sellers/42/brands');
    const wire = await recorder.take();
    expect(wire.map(({ body, status, contentType }) => ({ body, status, contentType }))).toEqual([
      { body: 'empty', status: 204, contentType: undefined },
      { body: 'non-json', status: 200, contentType: 'text/html' },
    ]);
    expect(wire.every((x) => x.shape === undefined)).toBe(true);
  });

  it('does not read error bodies (they may echo PII)', async () => {
    const res = json({ message: 'customer Ayşe not found' }, 404);
    const clone = vi.spyOn(res, 'clone');
    const recorder = createWireRecorder({ index, fetch: fakeFetch(() => res) });
    const got = await recorder.fetch(ORDERS);
    expect(clone).not.toHaveBeenCalled();
    expect(await got.json()).toEqual({ message: 'customer Ayşe not found' });
    expect(await recorder.take()).toEqual([
      expect.objectContaining({
        status: 404,
        body: 'not-recorded',
        contentType: 'application/json',
      }),
    ]);
  });

  it('records not-recorded when the clone cannot be made or read', async () => {
    const unclonable = json({ a: 1 });
    vi.spyOn(unclonable, 'clone').mockImplementation(() => {
      throw new TypeError('body used');
    });
    const unreadable = json({ a: 1 });
    vi.spyOn(unreadable, 'clone').mockImplementation(
      () => ({ text: () => Promise.reject(new Error('aborted')) }) as unknown as Response,
    );
    const recorder = createWireRecorder({
      index,
      fetch: fakeFetch(
        () => unclonable,
        () => unreadable,
      ),
    });
    await recorder.fetch(ORDERS);
    await recorder.fetch('https://api.example.com/v1/sellers/42/brands');
    expect((await recorder.take()).map((x) => x.body)).toEqual(['not-recorded', 'not-recorded']);
  });

  it('skips requests whose URL cannot be parsed', async () => {
    const recorder = createWireRecorder({ index, fetch: fakeFetch(() => json({})) });
    await recorder.fetch('/relative/path');
    expect(await recorder.take()).toEqual([]);
  });

  it('starts a fresh batch after take()', async () => {
    const recorder = createWireRecorder({ index, fetch: fakeFetch(() => json({ a: 1 })) });
    await recorder.fetch(ORDERS);
    expect(await recorder.take()).toHaveLength(1);
    expect(await recorder.take()).toEqual([]);
  });

  it('applies the summarize options (depth cap)', async () => {
    const recorder = createWireRecorder({
      index,
      fetch: fakeFetch(() => json({ a: { b: 1 } })),
      summarizeOptions: { maxDepth: 1, maxKeys: 80 },
    });
    await recorder.fetch(ORDERS);
    const [ex] = await recorder.take();
    expect(ex!.shape).toEqual({
      types: ['object'],
      keys: { a: { types: ['object'], depthCapped: true } },
    });
  });

  it('collapses a retried 503 followed by a 200 into the successful exchange', async () => {
    const recorder = createWireRecorder({
      index,
      fetch: fakeFetch(
        () => json({ error: 'busy' }, 503),
        () => json({ content: [{ a: 1 }] }),
        () => json({ content: [{ b: 'x' }] }),
      ),
    });
    await recorder.fetch(ORDERS);
    await recorder.fetch(ORDERS);
    await recorder.fetch(ORDERS);
    const wire = await recorder.take();
    expect(wire).toHaveLength(1);
    expect(wire[0]!.status).toBe(200);
    expect(wire[0]!.shape!.keys!.content!.items!.keys).toEqual({
      a: { types: ['number'] },
      b: { types: ['string'] },
    });
  });

  it('uses globalThis.fetch by default', async () => {
    const fake = fakeFetch(() => json({ ok: true }));
    const recorder = withGlobalFetch(fake, () => createWireRecorder({ index }));
    await recorder.fetch(ORDERS);
    expect(fake).toHaveBeenCalledOnce();
  });
});

describe('collapseExchanges', () => {
  const op = (key: string) =>
    ({ key, unmatched: true, method: 'GET', host: 'h', path: '/' }) as WireExchange['operation'];

  it('keeps repeated failures once per status when the operation never succeeded, sorted', () => {
    const out = collapseExchanges([
      { operation: op('GET b'), status: 500, body: 'not-recorded' },
      { operation: op('GET b'), status: 500, body: 'not-recorded' },
      { operation: op('GET b'), status: 429, body: 'not-recorded' },
      { operation: op('GET a'), status: 200, body: 'empty', contentType: 'text/plain' },
      { operation: op('GET a'), status: 200, body: 'non-json', contentType: 'text/html' },
    ]);
    expect(out).toEqual([
      {
        operation: op('GET a'),
        status: 200,
        contentType: 'text/html, text/plain',
        body: 'non-json',
      },
      { operation: op('GET b'), status: 429, body: 'not-recorded' },
      { operation: op('GET b'), status: 500, body: 'not-recorded' },
    ]);
  });

  it('keeps distinct 2xx statuses apart and prefers the JSON body when merging', () => {
    const out = collapseExchanges([
      { operation: op('GET a'), status: 201, body: 'empty' },
      { operation: op('GET a'), status: 200, body: 'non-json' },
      { operation: op('GET a'), status: 200, body: 'json', shape: { types: ['object'], keys: {} } },
    ]);
    expect(out.map((x) => [x.status, x.body])).toEqual([
      [200, 'json'],
      [201, 'empty'],
    ]);
  });
});

describe('withGlobalFetch', () => {
  it('restores the original fetch even when the builder throws', () => {
    const original = globalThis.fetch;
    const fake = fakeFetch(() => json({}));
    expect(() =>
      withGlobalFetch(fake, () => {
        expect(globalThis.fetch).toBe(fake);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(globalThis.fetch).toBe(original);
  });

  it('binds a real @lonca/trendyol client to the recorder (the probe runner relies on this)', async () => {
    const specsDir = fileURLToPath(new URL('../../../specs', import.meta.url));
    const realIndex = buildOperationIndex(loadSpecs(specsDir, ['trendyol']));
    const fake = fakeFetch(() =>
      json({ brands: [{ id: 1, name: 'Fixture Brand' }], totalElements: 1 }),
    );
    const recorder = createWireRecorder({ index: realIndex, fetch: fake });
    const client = withGlobalFetch(recorder.fetch, () =>
      createTrendyolClient({
        sellerId: 1,
        apiKey: 'k',
        apiSecret: 's',
        env: 'prod',
        integratorName: 'LoncaTest',
      }),
    );
    // The global is restored, yet the client keeps calling through the recorder.
    expect(globalThis.fetch).not.toBe(recorder.fetch);
    const page = await client.brands.list({ limit: 1 });
    expect(page.items).toHaveLength(1);
    const [ex] = await recorder.take();
    expect(ex).toMatchObject({
      operation: {
        spec: 'trendyol/product.json',
        method: 'GET',
        server: 'https://apigw.trendyol.com/integration',
      },
      status: 200,
      body: 'json',
    });
    expect(ex!.operation.key).toMatch(/^GET \/integration\/product\/brands/);
    expect(JSON.stringify(ex)).not.toContain('Fixture Brand');
  });
});

describe('diffWire', () => {
  const matchedOp = {
    key: 'GET /x',
    spec: 's.json',
    method: 'GET',
    path: '/x',
    specPath: '/x',
    server: 'https://h',
  };
  const ex = (over: Partial<WireExchange> = {}): WireExchange => ({
    operation: matchedOp,
    status: 200,
    contentType: 'application/json',
    body: 'json',
    shape: { types: ['object'], keys: { a: { types: ['string'] } } },
    ...over,
  });

  it('treats a snapshot without wire as "no baseline yet"', () => {
    expect(diffWire(undefined, [ex()])).toEqual({ baseline: 'missing' });
  });

  it('reports no change for identical lists', () => {
    expect(diffWire([ex()], [ex()])).toEqual({ baseline: 'present', changes: [], shapeDiffs: [] });
  });

  it('reports status, content type and body changes plus shape diffs per operation', () => {
    const d = diffWire(
      [ex()],
      [
        ex({
          status: 203,
          contentType: undefined,
          body: 'json',
          shape: { types: ['object'], keys: { a: { types: ['number'] } } },
        }),
      ],
    );
    expect(d).toEqual({
      baseline: 'present',
      changes: ['GET /x: status 200 → 203', 'GET /x: content type application/json → -'],
      shapeDiffs: [{ path: 'GET /x $.a', kind: 'type-changed', from: 'string', to: 'number' }],
    });
  });

  it('reports operations that appeared or disappeared', () => {
    const other: WireExchange = {
      operation: { key: 'GET h/y/{}', unmatched: true, method: 'GET', host: 'h', path: '/y/{}' },
      status: 404,
      body: 'not-recorded',
    };
    expect(diffWire([ex()], [other])).toMatchObject({
      changes: [
        'GET /x: no longer called (was HTTP 200 object{1})',
        'GET h/y/{} (no spec): new wire call (HTTP 404 not-recorded)',
      ],
    });
    expect(diffWire([ex()], undefined)).toMatchObject({
      changes: ['GET /x: no longer called (was HTTP 200 object{1})'],
    });
  });

  it('merges shapes of several entries for the same operation', () => {
    const before = [
      ex({ status: 200 }),
      ex({ status: 201, shape: { types: ['object'], keys: { b: { types: ['null'] } } } }),
    ];
    const after = [ex({ status: 200 }), ex({ status: 201, shape: undefined, body: 'empty' })];
    const d = diffWire(before, after);
    expect(d).toMatchObject({
      changes: ['GET /x: body json, json → json, empty'],
      shapeDiffs: [{ path: 'GET /x $.b', kind: 'removed' }],
    });
  });
});
