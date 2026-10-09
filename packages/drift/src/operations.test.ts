import { describe, expect, it } from 'vitest';
import type { SpecFile } from './openapi.js';
import {
  buildOperationIndex,
  defaultHostVariants,
  isUnmatched,
  redactPath,
  type MatchedOperation,
} from './operations.js';

const ok = { responses: { '200': { description: 'ok' } } };

/** Small fixture specs shaped like the real collection: one host-per-service HB-style, one shared-host TY-style. */
const SPECS: SpecFile[] = [
  {
    id: 'shop/orders.json',
    marketplace: 'shop',
    document: {
      servers: [
        { url: 'https://api.example.com/integration' },
        { url: 'https://stage-api.example.com/integration' },
      ],
      paths: {
        '/order/sellers/{sellerId}/orders': { get: { operationId: 'listOrders', ...ok } },
        '/order/sellers/{sellerId}/claims/{claimId}': { get: { operationId: 'getClaim', ...ok } },
        '/order/sellers/{sellerId}/claims/create': {
          get: { operationId: 'createClaimForm', ...ok },
          post: ok,
        },
        '/files/{name}.json': { get: { operationId: 'getFile', ...ok } },
      },
    },
  },
  {
    id: 'shop/videos.json',
    marketplace: 'shop',
    document: {
      servers: [{ url: 'https://api.example.com/integration/video' }],
      paths: { '/sellers/{sellerId}/videos': { get: { operationId: 'listVideos', ...ok } } },
    },
  },
  {
    id: 'hb/oms-external.json',
    marketplace: 'hb',
    document: {
      servers: [{ url: 'https://oms-external-sit.hepsiburada.com' }],
      paths: { '/packages/merchantid/{merchantId}': { get: ok, 'x-extension': { not: 'an op' } } },
    },
  },
  {
    id: 'rel/relative.json',
    marketplace: 'rel',
    document: { servers: [{ url: '/base' }], paths: { '/things/{id}': { get: ok } } },
  },
  { id: 'rel/no-servers.json', marketplace: 'rel', document: { paths: { '/ping': { get: ok } } } },
];

const index = buildOperationIndex(SPECS);

function matched(method: string, url: string): MatchedOperation {
  const op = index.match(method, url);
  if (isUnmatched(op)) throw new Error(`expected a match for ${method} ${url}, got ${op.key}`);
  return op;
}

describe('buildOperationIndex().match', () => {
  it('matches server base path + template, with path parameters as wildcards', () => {
    expect(
      matched(
        'GET',
        'https://api.example.com/integration/order/sellers/12345/orders?page=0&size=10',
      ),
    ).toEqual({
      key: 'GET /integration/order/sellers/{sellerId}/orders',
      spec: 'shop/orders.json',
      operationId: 'listOrders',
      method: 'GET',
      path: '/integration/order/sellers/{sellerId}/orders',
      specPath: '/order/sellers/{sellerId}/orders',
      server: 'https://api.example.com/integration',
    });
  });

  it('matches any of the listed servers and records which one', () => {
    expect(
      matched('get', 'https://stage-api.example.com/integration/order/sellers/1/orders').server,
    ).toBe('https://stage-api.example.com/integration');
  });

  it('distinguishes specs that share a host by their base path', () => {
    expect(matched('GET', 'https://api.example.com/integration/video/sellers/1/videos').spec).toBe(
      'shop/videos.json',
    );
  });

  it('prefers the template with more literal segments', () => {
    expect(
      matched('GET', 'https://api.example.com/integration/order/sellers/1/claims/create')
        .operationId,
    ).toBe('createClaimForm');
    expect(
      matched('GET', 'https://api.example.com/integration/order/sellers/1/claims/abc').operationId,
    ).toBe('getClaim');
  });

  it('requires the method to match', () => {
    expect(
      isUnmatched(
        index.match('DELETE', 'https://api.example.com/integration/order/sellers/1/orders'),
      ),
    ).toBe(true);
    expect(
      matched('POST', 'https://api.example.com/integration/order/sellers/1/claims/create')
        .operationId,
    ).toBeUndefined();
  });

  it('matches templates embedded in a segment', () => {
    expect(
      matched('GET', 'https://api.example.com/integration/files/report-2026.json').operationId,
    ).toBe('getFile');
  });

  it('accepts URL objects and percent-encoded segments', () => {
    expect(
      index.match('GET', new URL('https://api.example.com/integration/order/sellers/a%20b/orders'))
        .key,
    ).toBe('GET /integration/order/sellers/{sellerId}/orders');
    expect(
      matched('GET', 'https://api.example.com/integration/order/sellers/%E0%A4%A/orders')
        .operationId,
    ).toBe('listOrders');
  });

  it('ignores trailing slashes', () => {
    expect(
      matched('GET', 'https://api.example.com/integration/order/sellers/1/orders/').operationId,
    ).toBe('listOrders');
  });

  it('compares literal segments case-insensitively (merchantId vs merchantid)', () => {
    expect(
      matched('GET', 'https://oms-external-sit.hepsiburada.com/packages/merchantId/x').path,
    ).toBe('/packages/merchantid/{merchantId}');
    expect(
      matched('GET', 'https://api.example.com/integration/FILES/report.JSON').operationId,
    ).toBe('getFile');
  });

  it('matches a Hepsiburada production host against the documented SIT server', () => {
    const op = matched(
      'GET',
      'https://oms-external.hepsiburada.com/packages/merchantid/0b6f7e1a-0000-4000-8000-000000000000',
    );
    expect(op).toMatchObject({
      spec: 'hb/oms-external.json',
      path: '/packages/merchantid/{merchantId}',
    });
    expect(op.server).toBe('https://oms-external-sit.hepsiburada.com');
    expect(op.operationId).toBeUndefined();
  });

  it('lets relative servers (and specs without servers) match any host', () => {
    expect(matched('GET', 'https://anything.example/base/things/7').path).toBe('/base/things/{id}');
    expect(matched('GET', 'https://anything.example/ping').spec).toBe('rel/no-servers.json');
  });

  it('records an unmatched request with host and a redacted path, never the raw ids', () => {
    const op = index.match(
      'GET',
      'https://listing-external.hepsiburada.com/listings/merchantid/0b6f7e1a-0000-4000-8000-000000000000?offset=0',
    );
    expect(op).toEqual({
      key: 'GET listing-external.hepsiburada.com/listings/merchantid/{}',
      unmatched: true,
      method: 'GET',
      host: 'listing-external.hepsiburada.com',
      path: '/listings/merchantid/{}',
    });
  });

  it('supports custom host variants', () => {
    const custom = buildOperationIndex(SPECS, {
      hostVariants: (h) => (h === 'api.example.com' ? ['mirror.example.com'] : []),
    });
    expect(
      isUnmatched(
        custom.match('GET', 'https://mirror.example.com/integration/order/sellers/1/orders'),
      ),
    ).toBe(false);
    expect(
      isUnmatched(
        custom.match('GET', 'https://oms-external.hepsiburada.com/packages/merchantid/x'),
      ),
    ).toBe(true);
    expect(custom.size).toBe(index.size);
  });
});

describe('defaultHostVariants', () => {
  it('derives the production host of a Hepsiburada SIT host', () => {
    expect(defaultHostVariants('mpop-sit.hepsiburada.com')).toEqual(['mpop.hepsiburada.com']);
    expect(defaultHostVariants('api-asktoseller-merchant-sit.hepsiburada.com')).toEqual([
      'api-asktoseller-merchant.hepsiburada.com',
    ]);
  });

  it('leaves every other host alone', () => {
    expect(defaultHostVariants('apigw.trendyol.com')).toEqual([]);
    expect(defaultHostVariants('mpop-sit.example.com')).toEqual([]);
  });
});

describe('redactPath', () => {
  it.each([
    ['/listings/merchantid/0b6f7e1a-0000-4000-8000-000000000000', '/listings/merchantid/{}'],
    ['/integration/order/sellers/123456/orders', '/integration/order/sellers/{}/orders'],
    ['/api/v1/products/8690000000001', '/api/v1/products/{}'],
    ['/packages/ABC-123', '/packages/{}'],
    ['/packages/SKU', '/packages/{}'],
    ['/files/a%20b', '/files/{}'],
    ['/items/deadbeefcafebabe0123', '/items/{}'],
    ['/shipment-packages/manual_return/oauth2', '/shipment-packages/manual_return/oauth2'],
    [`/${'a'.repeat(41)}`, '/{}'],
    ['/', '/'],
  ])('%s → %s', (input, expected) => {
    expect(redactPath(input)).toBe(expected);
  });
});
