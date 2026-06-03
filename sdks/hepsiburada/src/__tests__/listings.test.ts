import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { ListingsResource } from '../resources/listings.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-42') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: HepsiburadaTransport) => new ListingsResource(t, fastLimiter());

// ─── list ────────────────────────────────────────────────────────────────

describe('ListingsResource.list', () => {
  it('GETs /listings/merchantid/{id} with offset+limit', async () => {
    const transport = mockTransport({ listings: [], totalCount: 0, limit: 100, offset: 0 });
    await r(transport).list({ offset: 0, limit: 100 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'listing',
        path: '/listings/merchantid/M-42',
        query: { offset: 0, limit: 100 },
      }),
    );
  });

  it('forwards optional filters with hyphenated query keys', async () => {
    const transport = mockTransport({ listings: [], totalCount: 0, limit: 50, offset: 0 });
    await r(transport).list({
      offset: 0,
      limit: 50,
      hbSkuList: 'HB1,HB2',
      merchantSkuList: 'M1',
      salableListings: true,
      notsalableListings: false,
      updateStartDate: '2026-01-01T00:00:00Z',
      productId: 'P-1',
    });

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({
      offset: 0,
      limit: 50,
      hbSkuList: 'HB1,HB2',
      merchantSkuList: 'M1',
      'salable-listings': true,
      'notsalable-listings': false,
      updateStartDate: '2026-01-01T00:00:00Z',
      productId: 'P-1',
    });
  });

  it('throws ValidationError on negative offset', async () => {
    const transport = mockTransport();
    await expect(r(transport).list({ offset: -1, limit: 100 })).rejects.toThrow(/offset must be/);
  });

  it('throws ValidationError on limit < 1', async () => {
    const transport = mockTransport();
    await expect(r(transport).list({ offset: 0, limit: 0 })).rejects.toThrow(/limit must be/);
  });

  it('normalizes the documented wire shape into typed Listings', async () => {
    // Field set per the spec's `Listing` schema.
    const transport = mockTransport({
      listings: [
        {
          listingId: 'L-1',
          hepsiburadaSku: 'HB-1',
          merchantSku: 'M-1',
          price: 199.9,
          availableStock: 10,
          dispatchTime: 2,
          maximumPurchasableQuantity: 5,
          minimumPurchasableQuantity: 1,
          isSalable: true,
          isSuspended: false,
          isLocked: false,
          isFrozen: false,
          isFulfilledByHB: false,
          priceIncreaseDisabled: false,
          priceDecreaseDisabled: false,
          stockDecreaseDisabled: false,
          hasVariant: false,
        },
      ],
      totalCount: 1,
      limit: 100,
      offset: 0,
    });

    const page = await r(transport).list({ offset: 0, limit: 100 });

    expect(page.totalCount).toBe(1);
    expect(page.pageCount).toBe(1);
    expect(page.items[0]).toMatchObject({
      listingId: 'L-1',
      hepsiburadaSku: 'HB-1',
      merchantSku: 'M-1',
      price: 199.9,
      availableStock: 10,
      isSalable: true,
    });
    // updatedAt is surfaced as null when the wire row carries no timestamp.
    expect(page.items[0]!.updatedAt).toBeNull();
  });

  it('surfaces updatedAt from the wire row when present', async () => {
    const transport = mockTransport({
      listings: [{ listingId: 'L-2', lastUpdateDate: '2026-05-01T08:00:00Z' }],
      totalCount: 1,
      limit: 100,
      offset: 0,
    });
    const page = await r(transport).list({ offset: 0, limit: 100 });
    expect(page.items[0]!.updatedAt).toBe('2026-05-01T08:00:00Z');
  });
});

// ─── Buybox / commissions ────────────────────────────────────────────────

describe('ListingsResource.getBuyboxOrder', () => {
  it('GETs /buybox-orders/merchantid/{id} with skuList query', async () => {
    const transport = mockTransport([
      { hepsiburadaSku: 'HB-1', merchantSku: 'M-1', buyboxOrder: 1, buyboxPrice: 100 },
    ]);
    const rows = await r(transport).getBuyboxOrder('HB-1,HB-2');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/buybox-orders/merchantid/M-42',
        query: { skuList: 'HB-1,HB-2' },
      }),
    );
    expect(rows[0]).toMatchObject({ hepsiburadaSku: 'HB-1', buyboxOrder: 1, buyboxPrice: 100 });
    expect(rows[0]!.raw).toBeDefined();
  });

  it('throws ValidationError when skuList is empty/missing', async () => {
    const transport = mockTransport([]);
    await expect(r(transport).getBuyboxOrder('')).rejects.toThrow(/skuList is required/);
    await expect(r(transport).getBuyboxOrder(undefined as unknown as string)).rejects.toThrow(
      /skuList is required/,
    );
  });

  it('also unwraps { items: [...] } envelope defensively', async () => {
    const transport = mockTransport({ items: [{ buyboxOrder: 2 }] });
    const rows = await r(transport).getBuyboxOrder('HB-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.buyboxOrder).toBe(2);
  });
});

describe('ListingsResource.getCommissions', () => {
  it('GETs /commissions/merchantid/{id} and surfaces commissionRate', async () => {
    const transport = mockTransport([{ hepsiburadaSku: 'HB-1', commissionRate: 13.5 }]);
    const rows = await r(transport).getCommissions('HB-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/commissions/merchantid/M-42' }),
    );
    expect(rows[0]).toMatchObject({ hepsiburadaSku: 'HB-1', commissionRate: 13.5 });
  });
});

// ─── Bulk upload contract (paths + body envelope + validation) ───────────

const uploadCases: Array<{
  name: string;
  pathSuffix: string;
  invoke: (res: ListingsResource) => Promise<unknown>;
  body: unknown;
}> = [
  {
    name: 'uploadInventory',
    pathSuffix: '/inventory-uploads',
    invoke: (res) => res.uploadInventory([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]),
    body: [{ hepsiburadaSku: 'HB-1', availableStock: 5 }],
  },
  {
    name: 'uploadStock',
    pathSuffix: '/stock-uploads',
    invoke: (res) => res.uploadStock([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]),
    body: [{ hepsiburadaSku: 'HB-1', availableStock: 5 }],
  },
  {
    name: 'uploadPrice',
    pathSuffix: '/price-uploads',
    invoke: (res) => res.uploadPrice([{ hepsiburadaSku: 'HB-1', price: 199.9 }]),
    body: [{ hepsiburadaSku: 'HB-1', price: 199.9 }],
  },
  {
    name: 'uploadShippingInfo',
    pathSuffix: '/shipping-info-uploads',
    invoke: (res) => res.uploadShippingInfo([{ hepsiburadaSku: 'HB-1', dispatchTime: 2 }]),
    body: [{ hepsiburadaSku: 'HB-1', dispatchTime: 2 }],
  },
  {
    name: 'uploadAdditionalInfo',
    pathSuffix: '/additional-info-uploads',
    invoke: (res) =>
      res.uploadAdditionalInfo([{ hepsiburadaSku: 'HB-1', customizationTextLength: 12 }]),
    body: [{ hepsiburadaSku: 'HB-1', customizationTextLength: 12 }],
  },
];

describe.each(uploadCases)('ListingsResource.$name', ({ name, pathSuffix, invoke, body }) => {
  it(`POSTs to /listings/merchantid/{id}${pathSuffix} with the raw items array as body`, async () => {
    const transport = mockTransport({ id: 'upload-1' });
    const out = await invoke(r(transport));
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'listing',
        path: `/listings/merchantid/M-42${pathSuffix}`,
        body,
      }),
    );
    expect(out).toEqual({ id: 'upload-1' });
  });

  it(`${name} throws ValidationError on empty items`, async () => {
    const transport = mockTransport({ id: 'never' });
    const empty = (r(transport) as unknown as Record<string, (a: unknown[]) => Promise<unknown>>)[
      name
    ]!.call(r(transport), []);
    await expect(empty).rejects.toThrow(/must not be empty/);
  });

  it(`${name} throws ValidationError on > 1000 items`, async () => {
    const transport = mockTransport({ id: 'never' });
    const tooMany = Array.from({ length: 1001 }, () => body) as unknown[];
    const fn = (r(transport) as unknown as Record<string, (a: unknown[]) => Promise<unknown>>)[
      name
    ]!;
    await expect(fn.call(r(transport), tooMany)).rejects.toThrow(/max 1000 items/);
  });

  it(`${name} defaults the receipt id to '' when response is empty`, async () => {
    const transport = mockTransport({});
    const out = (await invoke(r(transport))) as { id: string };
    expect(out.id).toBe('');
  });
});

// ─── Polling getters ─────────────────────────────────────────────────────

describe('ListingsResource — upload polling', () => {
  it('getStockUpload GETs the documented path and normalizes the result envelope', async () => {
    const transport = mockTransport({
      id: 'upload-1',
      status: 'COMPLETED_WITH_ERRORS',
      createdAt: '2026-01-01T10:00:00Z',
      total: 3,
      errors: [{ elementNo: 1, hepsiburadaSku: 'HB-1', errors: ['stock invalid'] }],
    });

    const result = await r(transport).getStockUpload('upload-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/listings/merchantid/M-42/stock-uploads/id/upload-1',
      }),
    );
    expect(result).toMatchObject({
      id: 'upload-1',
      status: 'COMPLETED_WITH_ERRORS',
      createdAt: '2026-01-01T10:00:00Z',
      total: 3,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      elementNo: 1,
      hepsiburadaSku: 'HB-1',
      errors: ['stock invalid'],
    });
  });

  it('getPriceUpload also surfaces priceValidations[]', async () => {
    const transport = mockTransport({
      id: 'upload-2',
      status: 'COMPLETED',
      createdAt: '2026-01-01T11:00:00Z',
      total: 1,
      errors: [],
      priceValidations: [
        {
          elementNo: 0,
          hepsiburadaSku: 'HB-9',
          type: 'MinPrice',
          minPrice: 100,
          maxPrice: 200,
          description: 'below floor',
        },
      ],
    });
    const result = await r(transport).getPriceUpload('upload-2');
    expect(result.priceValidations).toEqual([
      expect.objectContaining({
        elementNo: 0,
        hepsiburadaSku: 'HB-9',
        type: 'MinPrice',
        minPrice: 100,
        maxPrice: 200,
        description: 'below floor',
      }),
    ]);
  });

  it('GETs /inventory-uploads/id/{id} via getInventoryUpload', async () => {
    const transport = mockTransport({ id: 'inv-1', status: 'COMPLETED', total: 1, errors: [] });
    await r(transport).getInventoryUpload('inv-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/listings/merchantid/M-42/inventory-uploads/id/inv-1',
    );
  });

  it('GETs /shipping-info-uploads/id/{id} via getShippingInfoUpload', async () => {
    const transport = mockTransport({ id: 's-1', status: 'COMPLETED', total: 0, errors: [] });
    await r(transport).getShippingInfoUpload('s-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/listings/merchantid/M-42/shipping-info-uploads/id/s-1',
    );
  });

  it('GETs /additional-info-uploads/id/{id} via getAdditionalInfoUpload', async () => {
    const transport = mockTransport({ id: 'a-1', status: 'COMPLETED', total: 0, errors: [] });
    await r(transport).getAdditionalInfoUpload('a-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/listings/merchantid/M-42/additional-info-uploads/id/a-1',
    );
  });
});

// ─── Single-SKU mutations + bulk unlock ──────────────────────────────────

describe('ListingsResource — single-SKU + bulk unlock', () => {
  it('activate POSTs to /sku/{sku}/activate (no body)', async () => {
    const transport = mockTransport();
    await r(transport).activate('HB-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/listings/merchantid/M-42/sku/HB-1/activate');
    expect(call.body).toBeUndefined();
  });

  it('deactivate POSTs to /sku/{sku}/deactivate (no body)', async () => {
    const transport = mockTransport();
    await r(transport).deactivate('HB-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/listings/merchantid/M-42/sku/HB-1/deactivate',
    );
  });

  it('updateSingle POSTs to /sku/{sku}/merchantsku/{merchantSku} with body', async () => {
    const transport = mockTransport();
    await r(transport).updateSingle('HB-1', 'M-1', {
      newAvailableStock: 5,
      newPrice: { currency: 'TRY', amount: 199.9 },
      newDispatchTime: 2,
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/listings/merchantid/M-42/sku/HB-1/merchantsku/M-1',
        body: {
          newAvailableStock: 5,
          newPrice: { currency: 'TRY', amount: 199.9 },
          newDispatchTime: 2,
        },
      }),
    );
  });

  it('deleteSingle DELETEs the same per-SKU path', async () => {
    const transport = mockTransport();
    await r(transport).deleteSingle('HB-1', 'M-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('DELETE');
    expect(call.path).toBe('/listings/merchantid/M-42/sku/HB-1/merchantsku/M-1');
  });

  it('url-encodes funky SKU strings', async () => {
    const transport = mockTransport();
    await r(transport).activate('weird sku/1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toContain(
      'weird%20sku%2F1',
    );
  });

  it('bulkUnlock POSTs to /bulk-unlock with { hbSkuList } body', async () => {
    const transport = mockTransport();
    await r(transport).bulkUnlock({ hbSkuList: ['HB-1', 'HB-2'] });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/listings/merchantid/M-42/bulk-unlock',
        body: { hbSkuList: ['HB-1', 'HB-2'] },
      }),
    );
  });

  it('bulkUnlock throws ValidationError on empty list', async () => {
    const transport = mockTransport();
    await expect(r(transport).bulkUnlock({ hbSkuList: [] })).rejects.toThrow(/must not be empty/);
  });
});
