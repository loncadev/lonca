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

function newResource(transport: TrendyolTransport, sellerId = 42) {
  return new OrdersResource(transport, sellerId, fastLimiter());
}

describe('OrdersResource.updatePackageStatus', () => {
  it('PUTs to /shipment-packages/{id} with the given status body', async () => {
    const transport = mockTransport();
    await newResource(transport).updatePackageStatus(92051595, { status: 'Picking' });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595',
        body: { status: 'Picking' },
      }),
    );
  });

  it('forwards optional `lines` for partial transitions', async () => {
    const transport = mockTransport();
    await newResource(transport).updatePackageStatus('pkg-1', {
      status: 'Invoiced',
      lines: [{ lineId: 1, quantity: 2 }],
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { status: 'Invoiced', lines: [{ lineId: 1, quantity: 2 }] },
      }),
    );
  });

  it('url-encodes the package id', async () => {
    const transport = mockTransport();
    await newResource(transport).updatePackageStatus('weird id', { status: 'Picking' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/order/sellers/42/shipment-packages/weird%20id');
  });
});

describe('OrdersResource.cancelPackageItem', () => {
  it('PUTs to /items/unsupplied with lines + reasonId', async () => {
    const transport = mockTransport();
    await newResource(transport).cancelPackageItem(92051595, {
      lines: [{ lineId: 100, quantity: 1 }],
      reasonId: 577,
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/items/unsupplied',
        body: { lines: [{ lineId: 100, quantity: 1 }], reasonId: 577 },
      }),
    );
  });

  it('throws ValidationError on empty lines', async () => {
    const transport = mockTransport();
    await expect(
      newResource(transport).cancelPackageItem(1, { lines: [], reasonId: 577 }),
    ).rejects.toThrow(/lines must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('OrdersResource.extendDeliveryDate', () => {
  it.each([1, 2, 3] as const)(
    'PUTs to /extended-agreed-delivery-date with extendedDayCount=%i',
    async (days) => {
      const transport = mockTransport();
      await newResource(transport).extendDeliveryDate(92051595, days);

      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          path: '/integration/order/sellers/42/shipment-packages/92051595/extended-agreed-delivery-date',
          body: { extendedDayCount: days },
        }),
      );
    },
  );

  it('throws ValidationError on out-of-range days', async () => {
    const transport = mockTransport();
    await expect(newResource(transport).extendDeliveryDate(1, 4 as unknown as 1)).rejects.toThrow(
      /must be 1, 2, or 3/,
    );
    await expect(newResource(transport).extendDeliveryDate(1, 0 as unknown as 1)).rejects.toThrow(
      /must be 1, 2, or 3/,
    );
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('OrdersResource.processAlternativeDelivery', () => {
  it('PUTs to /alternative-delivery with the input as body', async () => {
    const transport = mockTransport();
    const input = {
      isPhoneNumber: false,
      trackingInfo: 'https://example-cargo.com/track/ABC123',
      params: { provider: 'EXAMPLE_CARGO' },
    };
    await newResource(transport).processAlternativeDelivery(92051595, input);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/alternative-delivery',
        body: input,
      }),
    );
  });

  it('also accepts a phone-number flavor', async () => {
    const transport = mockTransport();
    await newResource(transport).processAlternativeDelivery(1, {
      isPhoneNumber: true,
      trackingInfo: '+905551234567',
      params: {},
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.body).toMatchObject({ isPhoneNumber: true, trackingInfo: '+905551234567' });
  });
});
