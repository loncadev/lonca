import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { ProductsResource } from '../resources/products.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

function newResource(transport: TrendyolTransport, sellerId = 42) {
  return new ProductsResource(transport, sellerId, {
    filterLimiter: fastLimiter(),
    batchLimiter: fastLimiter(),
    buyboxLimiter: fastLimiter(),
  });
}

/**
 * Sample product node verified against Trendyol PROD (filterProducts approved
 * endpoint) on 2026-05-25 — trimmed to the fields we actually surface.
 */
const livePROD_sampleProduct = {
  contentId: 1149398615,
  productMainId: 'JD-CHE-TIGGO-142',
  brand: { id: 2038795, name: 'TROBUS' },
  category: { id: 4746, name: 'Oto Koltuk Kılıfı' },
  creationDate: 1779618357948,
  lastModifiedDate: 1779618858371,
  lastModifiedBy: 'quakka@trendyol.com',
  title: 'Chery Tiggo 7 Pro 2023 ve Sonrası Uyumlu Jetdrive Serisi Siyah Kırmızı',
  description: 'Long description here',
  images: [
    { url: 'https://cdn.dsmcdn.com/.../1_org_zoom.jpg' },
    { url: 'https://cdn.dsmcdn.com/.../2_org_zoom.jpg' },
  ],
  attributes: [{ attributeId: 47, attributeName: 'Renk', attributeValue: 'Siyah Kırmızı' }],
  variants: [
    {
      variantId: 1606966627,
      supplierId: 152771,
      barcode: 'TRBCHTIGG142SK',
      commission: 16.5,
      attributes: [],
      productUrl:
        'https://www.trendyol.com/abc/xyz-p-1149398615?&merchantId=152771&filterOverPriceListings=false',
      onSale: true,
      stock: { quantity: 100 },
    },
  ],
};

describe('ProductsResource.list', () => {
  it('hits /products/approved with default page=0 and size=50', async () => {
    const transport = mockTransport({ content: [] });
    const resource = newResource(transport);

    await resource.list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/sellers/42/products/approved',
        query: { size: 50, page: 0 },
      }),
    );
  });

  it('caps limit at the 1000 max', async () => {
    const transport = mockTransport({ content: [] });
    const resource = newResource(transport);

    await resource.list({ limit: 5000 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ size: 1000 }) }),
    );
  });

  it('forwards cursor as nextPageToken (instead of page=0)', async () => {
    const transport = mockTransport({ content: [] });
    const resource = newResource(transport);

    await resource.list({ cursor: 'abc123', limit: 100 });

    const query = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].query;
    expect(query).toMatchObject({ size: 100, nextPageToken: 'abc123' });
    expect(query).not.toHaveProperty('page');
  });

  it('forwards filter params (barcode, startDate, endDate)', async () => {
    const transport = mockTransport({ content: [] });
    const resource = newResource(transport);
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-02-01T00:00:00Z');

    await resource.list({ barcode: 'BC1', startDate: start, endDate: end });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          barcode: 'BC1',
          startDate: start.getTime(),
          endDate: end.getTime(),
        }),
      }),
    );
  });

  it('normalizes the live Trendyol product shape into the typed surface', async () => {
    const transport = mockTransport({ content: [livePROD_sampleProduct] });
    const resource = newResource(transport);

    const page = await resource.list();

    expect(page.items).toHaveLength(1);
    const p = page.items[0]!;
    expect(p).toMatchObject({
      contentId: '1149398615',
      productMainId: 'JD-CHE-TIGGO-142',
      title: livePROD_sampleProduct.title,
      description: 'Long description here',
      brand: { id: '2038795', name: 'TROBUS' },
      category: { id: '4746', name: 'Oto Koltuk Kılıfı' },
      images: [
        'https://cdn.dsmcdn.com/.../1_org_zoom.jpg',
        'https://cdn.dsmcdn.com/.../2_org_zoom.jpg',
      ],
      attributes: [{ attributeId: '47', attributeName: 'Renk', attributeValue: 'Siyah Kırmızı' }],
      createdAt: new Date(1779618357948).toISOString(),
      updatedAt: new Date(1779618858371).toISOString(),
      lastModifiedBy: 'quakka@trendyol.com',
    });
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({
      variantId: '1606966627',
      barcode: 'TRBCHTIGG142SK',
      commission: 16.5,
      onSale: true,
      stock: 100,
    });
    expect(p.raw.contentId).toBe(1149398615);
  });

  it('handles missing variants and images defensively', async () => {
    const transport = mockTransport({
      content: [{ contentId: 1, productMainId: 'X', title: 'Bare', brand: {}, category: {} }],
    });
    const resource = newResource(transport);

    const page = await resource.list();

    expect(page.items[0]).toMatchObject({
      contentId: '1',
      title: 'Bare',
      images: [],
      attributes: [],
      variants: [],
      brand: { id: '', name: '' },
    });
  });

  it('exposes nextPageToken as nextCursor only when present', async () => {
    const transport = mockTransport({ content: [], nextPageToken: 'tok-2' });
    expect((await newResource(transport).list()).nextCursor).toBe('tok-2');

    const transport2 = mockTransport({ content: [] });
    expect((await newResource(transport2).list()).nextCursor).toBeUndefined();
  });

  it('returns an empty page when content is missing', async () => {
    const transport = mockTransport({});
    const page = await newResource(transport).list();
    expect(page.items).toEqual([]);
  });

  it('accepts a raw stock number too (not just {quantity})', async () => {
    const transport = mockTransport({
      content: [
        {
          contentId: 1,
          productMainId: 'X',
          title: 't',
          brand: {},
          category: {},
          variants: [{ variantId: 1, barcode: 'B', stock: 42 }],
        },
      ],
    });
    const page = await newResource(transport).list();
    expect(page.items[0]!.variants[0]!.stock).toBe(42);
  });
});

describe('ProductsResource.getBatchStatus', () => {
  it('hits /products/batch-requests/{id} with the sellerId in the path', async () => {
    const transport = mockTransport({ batchRequestId: 'b1', status: 'COMPLETED', items: [] });
    const resource = newResource(transport, 7);

    await resource.getBatchStatus('b1');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/sellers/7/products/batch-requests/b1',
      }),
    );
  });

  it('URL-encodes the batchRequestId', async () => {
    const transport = mockTransport({ batchRequestId: 'x', status: 'COMPLETED', items: [] });
    const resource = newResource(transport);
    await resource.getBatchStatus('weird id');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/product/sellers/42/products/batch-requests/weird%20id');
  });

  it('normalizes a verified live batch result shape', async () => {
    // Field set verified against PROD on 2026-05-25.
    const transport = mockTransport({
      batchRequestId: 'b1',
      status: 'COMPLETED',
      itemCount: 2,
      failedItemCount: 1,
      creationDate: 1779618357948,
      lastModification: 1779618858371,
      sourceType: 'MarketPlace',
      batchRequestType: 'PriceUpdate',
      notes: 'all good',
      objectKey: 'k/b1.json',
      storeFrontCode: 'TR',
      items: [
        { requestItem: { barcode: 'A' }, status: 'SUCCESS' },
        { requestItem: { barcode: 'B' }, status: 'FAILED', failureReasons: ['barcode exists'] },
      ],
    });
    const resource = newResource(transport);

    const result = await resource.getBatchStatus('b1');

    expect(result).toMatchObject({
      batchRequestId: 'b1',
      status: 'COMPLETED',
      itemCount: 2,
      failedItemCount: 1,
      createdAt: new Date(1779618357948).toISOString(),
      lastModifiedAt: new Date(1779618858371).toISOString(),
      sourceType: 'MarketPlace',
      batchRequestType: 'PriceUpdate',
      notes: 'all good',
      objectKey: 'k/b1.json',
      storeFrontCode: 'TR',
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[1]!.failureReasons).toEqual(['barcode exists']);
    expect(result.raw).toBeDefined();
  });

  it('defaults to PROCESSING status when missing', async () => {
    const transport = mockTransport({ batchRequestId: 'b1', items: [] });
    const result = await newResource(transport).getBatchStatus('b1');
    expect(result.status).toBe('PROCESSING');
  });
});

describe('ProductsResource.listUnapproved', () => {
  it('hits /products/unapproved with page=0 and size=50 by default', async () => {
    const transport = mockTransport({ content: [] });
    await newResource(transport).listUnapproved();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/sellers/42/products/unapproved',
        query: { size: 50, page: 0 },
      }),
    );
  });

  it('forwards cursor + filter params + dateQueryType + supplierId', async () => {
    const transport = mockTransport({ content: [] });
    const start = new Date('2026-01-01T00:00:00Z');

    await newResource(transport).listUnapproved({
      cursor: 'tok-7',
      limit: 200,
      barcode: 'B1',
      startDate: start,
      dateQueryType: 'CREATED_DATE',
      supplierId: 99,
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          size: 200,
          nextPageToken: 'tok-7',
          barcode: 'B1',
          startDate: start.getTime(),
          dateQueryType: 'CREATED_DATE',
          supplierId: 99,
        },
      }),
    );
  });

  it('normalizes the live STAGE wire shape (flat barcode, images, rejection)', async () => {
    // Verified against Trendyol STAGE on 2026-05-25.
    const transport = mockTransport({
      content: [
        {
          supplierId: 2738,
          productMainId: 'CHTEST260522204622',
          status: 'rejected',
          createDateTime: 1779471989782,
          lastUpdateDate: 1779472029421,
          lastPriceChangeDate: 1779471989732,
          lastStockChangeDate: 1779471989732,
          brand: { id: 172147, name: 'AYŞE TAŞKALE' },
          category: { id: 31726, name: '0VxuerA' },
          barcode: 'CHTEST260522204622',
          title: 'Charybdis Stage Test Urunu',
          description: '<p>desc</p>',
          quantity: 0,
          listPrice: 129.9,
          salePrice: 99.9,
          vatRate: 20,
          dimensionalWeight: 1,
          stockCode: 'CHTEST-260522204622',
          origin: null,
          images: [{ url: 'https://cdn.example/1.jpg' }, { url: 'https://cdn.example/2.jpg' }],
          attributes: [],
          rejectReasonDetails: [
            {
              rejectReason: 'Kategori Bilgisi Eksik',
              rejectReasonDetail: 'detay',
            },
          ],
          locationBasedDelivery: 'DISABLED',
          lotNumber: null,
          specialConsumptionTax: null,
          sgrPrice: null,
        },
      ],
      page: 0,
      size: 1,
      totalPages: 1459,
      totalElements: 2917,
      nextPageToken: 'next-tok',
    });

    const page = await newResource(transport).listUnapproved({ limit: 1 });

    expect(page.nextCursor).toBe('next-tok');
    const u = page.items[0]!;
    expect(u).toMatchObject({
      supplierId: '2738',
      productMainId: 'CHTEST260522204622',
      status: 'rejected',
      brand: { id: '172147', name: 'AYŞE TAŞKALE' },
      category: { id: '31726', name: '0VxuerA' },
      barcode: 'CHTEST260522204622',
      title: 'Charybdis Stage Test Urunu',
      description: '<p>desc</p>',
      quantity: 0,
      listPrice: 129.9,
      salePrice: 99.9,
      vatRate: 20,
      dimensionalWeight: 1,
      stockCode: 'CHTEST-260522204622',
      origin: null,
      images: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
      attributes: [],
      rejectReasonDetails: [
        { rejectReason: 'Kategori Bilgisi Eksik', rejectReasonDetail: 'detay' },
      ],
      locationBasedDelivery: 'DISABLED',
      lotNumber: null,
      specialConsumptionTax: null,
      sgrPrice: null,
      createdAt: new Date(1779471989782).toISOString(),
      updatedAt: new Date(1779472029421).toISOString(),
      lastPriceChangedAt: new Date(1779471989732).toISOString(),
      lastStockChangedAt: new Date(1779471989732).toISOString(),
    });
  });

  it('falls back to the spec`s `media` field if `images` is absent', async () => {
    const transport = mockTransport({
      content: [
        {
          productMainId: 'P1',
          barcode: 'B1',
          title: 't',
          brand: {},
          category: {},
          media: [{ url: 'https://x/a.jpg' }],
        },
      ],
    });
    const page = await newResource(transport).listUnapproved();
    expect(page.items[0]!.images).toEqual(['https://x/a.jpg']);
  });
});

describe('ProductsResource.getBase', () => {
  it('hits /product/{barcode} with the sellerId in path', async () => {
    const transport = mockTransport({ barcode: 'B1', approved: true, archived: false });
    await newResource(transport).getBase('B1');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/sellers/42/product/B1',
      }),
    );
  });

  it('url-encodes the barcode', async () => {
    const transport = mockTransport({ barcode: 'odd id', approved: false, archived: false });
    await newResource(transport).getBase('odd id');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/product/sellers/42/product/odd%20id');
  });

  it('normalizes the verified live wire shape with ISO approvedAt', async () => {
    // Verified against Trendyol STAGE on 2026-05-25.
    const transport = mockTransport({
      barcode: '3535ddvcxxnnbbvc',
      approved: true,
      approvedDate: 1779363893000,
      archived: false,
      listingId: '67db4e3e7292a945c609db30cfc5109a',
      contentId: 1135615039,
    });

    const result = await newResource(transport).getBase('3535ddvcxxnnbbvc');

    expect(result).toMatchObject({
      barcode: '3535ddvcxxnnbbvc',
      approved: true,
      archived: false,
      approvedAt: new Date(1779363893000).toISOString(),
      listingId: '67db4e3e7292a945c609db30cfc5109a',
      contentId: '1135615039',
    });
  });

  it('omits approvedAt for unapproved products', async () => {
    const transport = mockTransport({ barcode: 'X', approved: false, archived: false });
    const result = await newResource(transport).getBase('X');
    expect(result.approvedAt).toBeUndefined();
  });
});

describe('ProductsResource.getBuyboxInfo', () => {
  it('POSTs to /products/buybox-information with body { barcodes }', async () => {
    const transport = mockTransport({ buyboxInfo: [] });
    await newResource(transport).getBuyboxInfo(['B1', 'B2']);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/product/sellers/42/products/buybox-information',
        body: { barcodes: ['B1', 'B2'] },
      }),
    );
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport({ buyboxInfo: [] });
    await expect(newResource(transport).getBuyboxInfo([])).rejects.toThrow(/non-empty/);
  });

  it('throws ValidationError on more than 10 barcodes', async () => {
    const transport = mockTransport({ buyboxInfo: [] });
    const tooMany = Array.from({ length: 11 }, (_, i) => `B${i}`);
    await expect(newResource(transport).getBuyboxInfo(tooMany)).rejects.toThrow(/max 10/);
  });

  it('normalizes the verified live wire shape with second/third prices', async () => {
    // Verified against Trendyol STAGE on 2026-05-25.
    const transport = mockTransport({
      buyboxInfo: [
        {
          barcode: '3535ddvcxxnnbbvc',
          buyboxPrice: 100,
          buyboxOrder: 1,
          hasMultipleSeller: false,
          secondBuyboxPrice: null,
          thirdBuyboxPrice: null,
        },
      ],
    });

    const results = await newResource(transport).getBuyboxInfo(['3535ddvcxxnnbbvc']);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      barcode: '3535ddvcxxnnbbvc',
      buyboxPrice: 100,
      buyboxOrder: 1,
      hasMultipleSeller: false,
      secondBuyboxPrice: null,
      thirdBuyboxPrice: null,
    });
  });

  it('also accepts `content` as an alias for `buyboxInfo`', async () => {
    const transport = mockTransport({
      content: [{ barcode: 'X', buyboxOrder: 2, buyboxPrice: 50, hasMultipleSeller: true }],
    });
    const results = await newResource(transport).getBuyboxInfo(['X']);
    expect(results).toHaveLength(1);
    expect(results[0]!.buyboxOrder).toBe(2);
  });
});
