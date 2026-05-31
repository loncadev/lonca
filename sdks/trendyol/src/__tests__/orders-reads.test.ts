import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '../resources/orders.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new OrdersResource(t, fastLimiter());

describe('OrdersResource.listStream', () => {
  it('GETs /orders/stream with default page-size and no cursor', async () => {
    const transport = mockTransport({ content: [], hasMore: false });
    await r(transport).listStream();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/order/sellers/42/orders/stream',
        query: { size: 50 },
      }),
    );
  });

  it('forwards cursor as `nextCursor` query param', async () => {
    const transport = mockTransport({ content: [], hasMore: true, nextCursor: 'tok-2' });
    const page = await r(transport).listStream({ cursor: 'tok-1', limit: 200 });

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ size: 200, nextCursor: 'tok-1' });
    expect(page.nextCursor).toBe('tok-2');
  });

  it('forwards filters (packageItemStatuses + date range)', async () => {
    const transport = mockTransport({ content: [], hasMore: false });
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-05-01T00:00:00Z');

    await r(transport).listStream({
      packageItemStatuses: 'Created,Picking',
      lastModifiedStartDate: start,
      lastModifiedEndDate: end,
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          packageItemStatuses: 'Created,Picking',
          lastModifiedStartDate: start.getTime(),
          lastModifiedEndDate: end.getTime(),
        }),
      }),
    );
  });

  it('omits nextCursor when hasMore=false', async () => {
    const transport = mockTransport({ content: [], hasMore: false, nextCursor: 'tok-x' });
    const page = await r(transport).listStream();
    expect(page.nextCursor).toBeUndefined();
  });

  it('normalizes the stream response (uses `id` field, not `shipmentPackageId`)', async () => {
    // Stream's spec returns `id` where the regular list returns `shipmentPackageId`.
    const transport = mockTransport({
      content: [
        {
          id: 92051591,
          orderNumber: '625788652',
          status: 'Created',
          orderDate: 1779363893000,
          lastModifiedDate: 1779363893000,
          currencyCode: 'TRY',
          packageTotalPrice: 85,
        },
      ],
      hasMore: false,
    });

    const page = await r(transport).listStream();
    expect(page.items[0]!.id).toBe('92051591');
    expect(page.items[0]!.orderNumber).toBe('625788652');
  });
});

describe('OrdersResource.getCargoInvoiceItems', () => {
  it('GETs /finance/che/.../cargo-invoice/{serial}/items with page+size', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).getCargoInvoiceItems('INV-2026-001');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/finance/che/sellers/42/cargo-invoice/INV-2026-001/items',
        query: { page: 0, size: 500 },
      }),
    );
  });

  it('forwards cursor as page index and emits next cursor when more pages remain', async () => {
    const transport = mockTransport({ content: [], totalPages: 3 });
    const page = await r(transport).getCargoInvoiceItems('S1', { cursor: '0', limit: 200 });

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ page: 0, size: 200 });
    expect(page.nextCursor).toBe('1');
  });

  it('caps limit at 500', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).getCargoInvoiceItems('S1', { limit: 5000 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ page: 0, size: 500 });
  });

  it('url-encodes the serial number', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).getCargoInvoiceItems('weird serial/2026');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toContain('weird%20serial%2F2026');
  });

  it('normalizes the documented row shape', async () => {
    const transport = mockTransport({
      page: 0,
      size: 500,
      totalPages: 1,
      totalElements: 2,
      content: [
        {
          shipmentPackageType: 'Gönderi Kargo Bedeli',
          parcelUniqueId: 7260001151141191,
          orderNumber: '2111681160',
          amount: 34.24,
          desi: 1,
        },
        {
          shipmentPackageType: 'İade Kargo Bedeli',
          parcelUniqueId: 7265609146531138,
          orderNumber: '2111161312',
          amount: 34.24,
          desi: 1,
        },
      ],
    });

    const page = await r(transport).getCargoInvoiceItems('INV-1');
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      shipmentPackageType: 'Gönderi Kargo Bedeli',
      parcelUniqueId: '7260001151141191',
      orderNumber: '2111681160',
      amount: 34.24,
      desi: 1,
    });
  });
});
