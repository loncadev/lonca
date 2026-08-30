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
    const rows = await r(transport).listProductsByStatus({ status: 'MATCHED' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchantSku).toBe('MSKU-1');
    expect(rows[0]!.title).toBe('Ürün 1');
    expect(rows[0]!.raw.productStatus).toBe('Satışa Hazır');
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
    await expect(r(transport).listProductsByStatus({ status: 'REJECTED' })).resolves.toEqual([]);
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
