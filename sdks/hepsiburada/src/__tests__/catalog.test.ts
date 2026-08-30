import { describe, expect, it, vi } from 'vitest';
import { ServerError, TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { CatalogResource } from '../resources/catalog.js';
import { mapHttpError } from '../errors.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-cat') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: HepsiburadaTransport) => new CatalogResource(t, fastLimiter());
const lastQuery = (t: HepsiburadaTransport) =>
  (t.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].query as Record<string, unknown>;

/**
 * Spring-page envelope exactly as `products-by-merchant-and-status` returns it
 * (verified live 2026-08 on SIT: 46 MATCHED rows over 10 pages of 5).
 */
const byStatusEnvelope = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  success: true,
  code: 0,
  version: 1,
  message: null,
  totalElements: 46,
  totalPages: 10,
  number: 0,
  numberOfElements: rows.length,
  first: true,
  last: false,
  data: rows,
  ...extra,
});

/** Body Hepsiburada sends with its HTTP 500 for a bad/missing `productStatus`. */
const hb500Body = {
  message: 'global.messages.error.internalServerError',
  description: 'Internal server error',
  fieldErrors: null,
};

describe('catalog.listProductsByStatus — request shape (HTTP 500 regression)', () => {
  it('sends the status as `productStatus` (the parameter Hepsiburada requires), never as `status`', async () => {
    const transport = mockTransport(byStatusEnvelope([]));
    await r(transport).listProductsByStatus({ status: 'MATCHED', page: 0, size: 5 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.service).toBe('mpop');
    expect(call.path).toBe('/product/api/products/products-by-merchant-and-status');
    expect(call.query).toMatchObject({
      merchantId: 'M-cat',
      productStatus: 'MATCHED',
      page: 0,
      size: 5,
    });
    // The pre-fix shape (`status=…`) made the server answer 500 because the
    // required `productStatus` was absent.
    expect(lastQuery(transport)).not.toHaveProperty('status');
  });

  it('passes the documented optional `taskStatus` / `version` through and drops the undocumented `modifiedAtSince`', async () => {
    const transport = mockTransport(byStatusEnvelope([]));
    await r(transport).listProductsByStatus({
      status: 'WAITING',
      taskStatus: true,
      version: 1,
      modifiedAtSince: '2026-01-01T00:00:00Z',
    });
    const query = lastQuery(transport);
    expect(query).toMatchObject({ productStatus: 'WAITING', taskStatus: true, version: 1 });
    expect(query).not.toHaveProperty('modifiedAtSince');
  });

  it('rejects a missing/empty status client-side with ValidationError (server would 500)', async () => {
    const transport = mockTransport(byStatusEnvelope([]));
    await expect(
      r(transport).listProductsByStatus({} as unknown as { status: string }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(r(transport).listProductsByStatus({ status: '' })).rejects.toThrow(/status/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('passes an unlisted status string through unchanged (forward-compatible, never re-cased)', async () => {
    const transport = mockTransport(byStatusEnvelope([]));
    await r(transport).listProductsByStatus({ status: 'SOME_FUTURE_STATUS' });
    expect(lastQuery(transport).productStatus).toBe('SOME_FUTURE_STATUS');
  });

  it('unwraps the live Spring-page envelope into rows', async () => {
    const transport = mockTransport(
      byStatusEnvelope([
        {
          merchantSku: 'MSKU-1',
          barcode: 'BAR-1',
          hbSku: 'HB-1',
          productName: 'Ürün 1',
          productStatus: 'Satışa Hazır',
          taskDetails: [],
        },
      ]),
    );
    const { items } = await r(transport).listProductsByStatus({ status: 'MATCHED' });
    expect(items).toHaveLength(1);
    expect(items[0]!.merchantSku).toBe('MSKU-1');
    expect(items[0]!.title).toBe('Ürün 1');
    expect(items[0]!.raw.productStatus).toBe('Satışa Hazır');
  });

  it('surfaces an empty status bucket (HTTP 200, success:false, code:4008) as an empty list', async () => {
    const transport = mockTransport({
      success: false,
      code: 4008,
      version: 1,
      message: 'Product is not found with merchant id: M-cat, status: REJECTED, taskStatus: false',
      totalElements: 0,
      totalPages: 0,
      number: 0,
      numberOfElements: 0,
      first: false,
      last: false,
      data: [],
    });
    await expect(r(transport).listProductsByStatus({ status: 'REJECTED' })).resolves.toEqual({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
    });
  });

  it('still surfaces a genuine HTTP 500 as ServerError', async () => {
    const transport = {
      merchantId: 'M-cat',
      request: vi.fn().mockRejectedValue(mapHttpError(500, hb500Body)),
    } as unknown as HepsiburadaTransport;
    const err = await r(transport)
      .listProductsByStatus({ status: 'MATCHED' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).status).toBe(500);
  });
});

/** Live `all-products-of-merchant` envelope (SIT, 2026-08: 91 rows, page 1 of size 2 → 46 pages). */
const allProductsEnvelope = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  success: true,
  code: 0,
  version: 1,
  message: null,
  totalElements: 91,
  totalPages: 46,
  number: 1,
  numberOfElements: rows.length,
  first: false,
  last: false,
  data: rows,
  ...extra,
});

describe('catalog list endpoints → OffsetPage', () => {
  it('maps the Spring envelope onto OffsetPage (totalElements → totalCount, totalPages → pageCount, data → items)', async () => {
    const transport = mockTransport(
      allProductsEnvelope([{ merchantSku: 'A' }, { merchantSku: 'B' }]),
    );
    const page = await r(transport).listProducts({ page: 1, size: 2 });
    expect(page).toMatchObject({ totalCount: 91, pageCount: 46, limit: 2, offset: 2 });
    expect(page.items.map((p) => p.merchantSku)).toEqual(['A', 'B']);
  });

  it('derives limit from the server page when size is omitted (never assumes a default)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ merchantSku: `S-${i}` }));
    const transport = mockTransport(
      allProductsEnvelope(rows, { totalPages: 5, number: 2, numberOfElements: 20 }),
    );
    const page = await r(transport).listProducts();
    expect(page).toMatchObject({ totalCount: 91, pageCount: 5, limit: 20, offset: 40 });
    expect(page.items).toHaveLength(20);
  });

  it('treats a bare array as a single un-paged result', async () => {
    const page = await r(
      mockTransport([{ merchantSku: 'X' }, { merchantSku: 'Y' }]),
    ).listProducts();
    expect(page).toMatchObject({ totalCount: 2, limit: 2, offset: 0, pageCount: 1 });
    expect(page.items).toHaveLength(2);
  });

  it('still unwraps { content } / { items } envelopes without paging metadata', async () => {
    const a = await r(mockTransport({ content: [{ merchantSku: 'C' }] })).listProducts();
    expect(a.items[0]!.merchantSku).toBe('C');
    expect(a).toMatchObject({ totalCount: 1, pageCount: 1 });
    const b = await r(mockTransport({ items: [] })).listProducts();
    expect(b).toMatchObject({ totalCount: 0, pageCount: 0, items: [] });
  });

  it('surfaces a no-match filter (HTTP 200, success:false, code:4014) as an empty page', async () => {
    const transport = mockTransport({
      success: false,
      code: 4014,
      message: 'Merchant products not found by merchantId M-cat',
      totalElements: 0,
      totalPages: 0,
      number: 0,
      numberOfElements: 0,
      first: false,
      last: false,
      data: [],
    });
    const page = await r(transport).listProducts({ merchantSku: '__none__', page: 0, size: 5 });
    expect(page).toEqual({ totalCount: 0, limit: 5, offset: 0, pageCount: 0, items: [] });
  });

  it('passes the documented barcode / merchantSku / hbSku filters through', async () => {
    const transport = mockTransport(allProductsEnvelope([]));
    await r(transport).listProducts({ barcode: 'B1', merchantSku: 'M1', hbSku: 'H1' });
    expect(lastQuery(transport)).toMatchObject({ barcode: 'B1', merchantSku: 'M1', hbSku: 'H1' });
  });

  it('accepts offset/limit (paginateOffset contract) and converts them to page/size', async () => {
    const transport = mockTransport(allProductsEnvelope([]));
    await r(transport).listProducts({ offset: 200, limit: 100 });
    expect(lastQuery(transport)).toMatchObject({ page: 2, size: 100 });
    const t2 = mockTransport(byStatusEnvelope([]));
    await r(t2).listProductsByStatus({ status: 'MATCHED', offset: 0 });
    expect(lastQuery(t2)).toMatchObject({ page: 0 });
    expect(lastQuery(t2).size).toBeUndefined();
  });

  it('rejects offset/limit combinations Hepsiburada cannot express', async () => {
    const t = () => r(mockTransport(allProductsEnvelope([])));
    await expect(t().listProducts({ offset: 10, limit: 4 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(t().listProducts({ offset: 10 })).rejects.toThrow(/offset requires limit/);
    await expect(t().listProducts({ offset: 0, limit: 0 })).rejects.toThrow(/limit/);
    await expect(t().listProducts({ offset: -1, limit: 5 })).rejects.toThrow(/offset/);
    await expect(t().listProducts({ page: 1, limit: 5 })).rejects.toThrow(/not both/);
  });

  it('drives paginateOffset end to end (offset steps by the requested limit, stops at pageCount)', async () => {
    const { paginateOffset } = await import('@lonca/core');
    const pages = [
      allProductsEnvelope([{ merchantSku: '1' }, { merchantSku: '2' }], {
        totalElements: 5,
        totalPages: 3,
        number: 0,
      }),
      allProductsEnvelope([{ merchantSku: '3' }, { merchantSku: '4' }], {
        totalElements: 5,
        totalPages: 3,
        number: 1,
      }),
      allProductsEnvelope([{ merchantSku: '5' }], {
        totalElements: 5,
        totalPages: 3,
        number: 2,
        numberOfElements: 1,
        last: true,
      }),
    ];
    const request = vi.fn();
    for (const p of pages) request.mockResolvedValueOnce(p);
    const transport = { merchantId: 'M-cat', request } as unknown as HepsiburadaTransport;
    const catalog = r(transport);
    const seen: string[] = [];
    for await (const p of paginateOffset((q) => catalog.listProducts(q), { limit: 2 })) {
      seen.push(p.merchantSku!);
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5']);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map((c) => [c[0].query.page, c[0].query.size])).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });
});
