import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '../resources/orders.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport, sellerId = 42) => new OrdersResource(t, sellerId, fastLimiter());

describe('OrdersResource.manualReturnByPackageId', () => {
  it('PUTs to /manual-return with no body', async () => {
    const transport = mockTransport();
    await r(transport).manualReturnByPackageId(92051595);

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/92051595/manual-return',
    );
    expect(call.body).toBeUndefined();
  });

  it('url-encodes the package id', async () => {
    const transport = mockTransport();
    await r(transport).manualReturnByPackageId('weird id');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toContain('weird%20id');
  });
});

describe('OrdersResource.manualReturnByTrackingNumber', () => {
  it('PUTs to the sibling tracking-number path with no body', async () => {
    const transport = mockTransport();
    await r(transport).manualReturnByTrackingNumber('TRK12345');

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/manual-return-by-tracking-number/TRK12345',
    );
    expect(call.body).toBeUndefined();
  });

  it('accepts numeric tracking numbers', async () => {
    const transport = mockTransport();
    await r(transport).manualReturnByTrackingNumber(9876543210);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/manual-return-by-tracking-number/9876543210',
    );
  });
});

describe('OrdersResource.getCompensationTickets', () => {
  it('GETs /tex/compensation/sellers/{id}/tickets with default page+size', async () => {
    const transport = mockTransport({ totalCount: 0, data: { items: [] } });
    await r(transport).getCompensationTickets();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/tex/compensation/sellers/42/tickets',
        query: { page: 0, size: 200 },
      }),
    );
  });

  it('forwards date filters as ms-epoch and caps size at 200', async () => {
    const transport = mockTransport({ totalCount: 0, data: { items: [] } });
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-02-01T00:00:00Z');

    await r(transport).getCompensationTickets({ startDate: start, endDate: end, limit: 5000 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          page: 0,
          size: 200,
          startDate: start.getTime(),
          endDate: end.getTime(),
        },
      }),
    );
  });

  it('forwards cursor as page index and emits nextCursor while more pages remain', async () => {
    const transport = mockTransport({ totalCount: 500, data: { items: [] } });
    const page = await r(transport).getCompensationTickets({ cursor: '0', limit: 100 });

    expect(page.nextCursor).toBe('1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({ page: 0, size: 100 });
  });

  it('normalizes the documented ticket shape with ISO `createdAt`', async () => {
    const transport = mockTransport({
      totalCount: 1,
      data: {
        items: [
          {
            cargoProvider: 'TEX',
            compensateReason: 'Hasarlı paket',
            createDate: 1779363893000,
            currentState: 'CompensationApproved',
            deliveryNumber: 'DLV-1',
            orderNumber: 'ORD-1',
            requestedBy: 'seller',
            stateMessage: 'Onaylandı',
            totalItemsAmount: '125.50',
            itemDetails: [{ itemAmount: 100, itemCode: 'C1', itemCount: 1, itemName: 'Etek' }],
          },
        ],
      },
    });

    const page = await r(transport).getCompensationTickets();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      cargoProvider: 'TEX',
      compensateReason: 'Hasarlı paket',
      createdAt: new Date(1779363893000).toISOString(),
      currentState: 'CompensationApproved',
      deliveryNumber: 'DLV-1',
      orderNumber: 'ORD-1',
      requestedBy: 'seller',
      stateMessage: 'Onaylandı',
      totalItemsAmount: '125.50',
      itemDetails: [{ itemAmount: 100, itemCode: 'C1', itemCount: 1, itemName: 'Etek' }],
    });
    expect(page.items[0]!.raw).toBeDefined();
  });

  it('accepts data as a raw array too (defensive fallback)', async () => {
    const transport = mockTransport({
      totalCount: 1,
      data: [{ orderNumber: 'O1', currentState: 'Empty', itemDetails: [] }],
    });
    const page = await r(transport).getCompensationTickets();
    expect(page.items[0]!.orderNumber).toBe('O1');
  });

  it('accepts top-level `content` array (alternative shape)', async () => {
    const transport = mockTransport({
      totalCount: 1,
      content: [{ orderNumber: 'O2', itemDetails: [] }],
    });
    const page = await r(transport).getCompensationTickets();
    expect(page.items[0]!.orderNumber).toBe('O2');
  });

  it('omits nextCursor when no more pages remain', async () => {
    const transport = mockTransport({ totalCount: 50, data: { items: [] } });
    const page = await r(transport).getCompensationTickets({ limit: 100 });
    expect(page.nextCursor).toBeUndefined();
  });
});
