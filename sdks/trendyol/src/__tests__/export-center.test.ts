import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { ExportCenterResource } from '../resources/export-center.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, sellerId = 42) {
  return {
    sellerId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new ExportCenterResource(t, fastLimiter());

// ─── Products ────────────────────────────────────────────────────────────

describe('ExportCenterResource.listProducts', () => {
  it('GETs /integration/ecgw/v2/{id}/products with no query by default', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listProducts();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/ecgw/v2/42/products',
      }),
    );
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toBeUndefined();
  });

  it('forwards barcodes (joined CSV), pageKey, size', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listProducts({ barcodes: ['HB1', 'HB2'], pageKey: 'tok-1', size: 50 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ barcodes: 'HB1,HB2', pageKey: 'tok-1', size: 50 });
  });

  it('unwraps content / items / data envelopes + surfaces raw', async () => {
    const rowsContent = await r(mockTransport({ content: [{ barcode: 'A' }] })).listProducts();
    expect(rowsContent[0]!.raw).toMatchObject({ barcode: 'A' });
    const rowsArray = await r(mockTransport([{ barcode: 'B' }])).listProducts();
    expect(rowsArray[0]!.raw).toMatchObject({ barcode: 'B' });
  });
});

describe('ExportCenterResource.createProducts / updatePrices / updateStocks', () => {
  it.each([
    ['createProducts', 'POST', '/integration/ecgw/v2/42/products', 'products'],
    ['updatePrices', 'POST', '/integration/ecgw/v1/42/prices', 'priceInfos'],
    ['updateStocks', 'POST', '/integration/ecgw/v1/42/stocks', 'items'],
  ] as const)('%s POSTs to %s with body wrapper %s', async (method, verb, path, key) => {
    const transport = mockTransport({ batchId: 'BR-1' });
    const resource = r(transport);
    const items = [{ barcode: 'X' }];
    await resource[method](items);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, path, body: { [key]: items } }),
    );
  });

  it.each(['createProducts', 'updatePrices', 'updateStocks'] as const)(
    '%s throws on empty array',
    async (method) => {
      const resource = r(mockTransport({}));
      await expect(resource[method]([])).rejects.toThrow(ValidationError);
    },
  );

  it.each(['createProducts', 'updatePrices', 'updateStocks'] as const)(
    '%s throws on >5000 items',
    async (method) => {
      const resource = r(mockTransport({}));
      const oversized = Array.from({ length: 5001 }, () => ({ barcode: 'X' }));
      await expect(resource[method](oversized)).rejects.toThrow(/max 5000/);
    },
  );

  it('createProducts returns { batchId, raw } envelope', async () => {
    const transport = mockTransport({ batchId: 'BR-7' });
    const out = await r(transport).createProducts([{ barcode: 'A' }]);
    expect(out.batchId).toBe('BR-7');
    expect(out.raw).toBeDefined();
  });

  it('createProducts falls back to batchRequestId / id on the wire', async () => {
    const out = await r(mockTransport({ batchRequestId: 'B-2' })).createProducts([{ x: 1 }]);
    expect(out.batchId).toBe('B-2');
  });
});

// ─── Batch status ────────────────────────────────────────────────────────

describe('ExportCenterResource.getBatchStatus', () => {
  it('GETs /check-status?batchId=...', async () => {
    const transport = mockTransport({ batchId: 'B-1', status: 'DONE', itemCount: 3 });
    const out = await r(transport).getBatchStatus('B-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/ecgw/v1/42/check-status',
        query: { batchId: 'B-1' },
      }),
    );
    expect(out).toMatchObject({ batchId: 'B-1', status: 'DONE', itemCount: 3 });
  });

  it('throws on empty batchId', async () => {
    await expect(r(mockTransport()).getBatchStatus('')).rejects.toThrow(/batchId is required/);
  });
});

// ─── Packages ────────────────────────────────────────────────────────────

describe('ExportCenterResource — packages', () => {
  it('listPackagesV2 GETs /v2/{id}/packages with query', async () => {
    const transport = mockTransport({ content: [{ packageNumber: 'PKG-1', status: 'new' }] });
    const out = await r(transport).listPackagesV2({
      status: 'new',
      trackingNumber: 'TRK1',
      size: 50,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v2/42/packages');
    expect(call.query).toMatchObject({ trackingNumber: 'TRK1', status: 'new', size: 50 });
    expect(out[0]).toMatchObject({ packageNumber: 'PKG-1', status: 'new' });
  });

  it('listPackagesV3 uses /v3 path + page/size from limit/offset', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listPackagesV3({ offset: 2, limit: 25, status: 'completed' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v3/42/packages');
    expect(call.query).toMatchObject({ status: 'completed', page: 2, size: 25 });
  });

  it('getPackageItems GETs /v2/{id}/packages/items with packageId in query', async () => {
    const transport = mockTransport({ content: [{ barcode: 'A' }] });
    await r(transport).getPackageItems({ packageId: 'PKG-1', status: 'pending', limit: 30 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v2/42/packages/items');
    expect(call.query).toMatchObject({ packageId: 'PKG-1', status: 'pending', size: 30 });
  });

  it('getPackageItems throws when packageId is missing', async () => {
    await expect(
      r(mockTransport()).getPackageItems({ packageId: '' } as { packageId: string }),
    ).rejects.toThrow(/packageId is required/);
  });
});

// ─── Lookup ──────────────────────────────────────────────────────────────

describe('ExportCenterResource — lookup', () => {
  it('getCategoryAttributes GETs the right path + url-encodes category id', async () => {
    const transport = mockTransport([{ attributeId: 100, attributeName: 'Color', required: true }]);
    const out = await r(transport).getCategoryAttributes('cat/with/slashes');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe(
      '/integration/ecgw/v1/42/lookup/product-categories/cat%2Fwith%2Fslashes/attributes',
    );
    expect(out[0]).toMatchObject({ attributeId: 100, attributeName: 'Color', required: true });
  });

  it('getCategoryAttributes throws on missing id', async () => {
    await expect(r(mockTransport()).getCategoryAttributes('' as unknown as string)).rejects.toThrow(
      /categoryId is required/,
    );
  });

  it.each([
    ['getCareInstructions', '/integration/ecgw/v1/42/lookup/care-instructions'],
    ['getCompositions', '/integration/ecgw/v1/42/lookup/compositions'],
    ['getOrigins', '/integration/ecgw/v1/42/lookup/origins'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport([{ id: 1, name: 'Sample' }]);
    const resource = r(transport);
    const out = await resource[method]();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path }),
    );
    expect(out[0]).toMatchObject({ id: 1, name: 'Sample' });
  });

  it('getOrigins surfaces countryCode when present', async () => {
    const out = await r(
      mockTransport([{ id: 1, name: 'Türkiye', countryCode: 'TR' }]),
    ).getOrigins();
    expect(out[0]).toMatchObject({ id: 1, name: 'Türkiye', countryCode: 'TR' });
  });
});
