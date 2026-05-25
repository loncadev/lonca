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

describe('OrdersResource.changeCargoProvider', () => {
  it('PUTs to /cargo-providers with { cargoProvider }', async () => {
    const transport = mockTransport();
    await r(transport).changeCargoProvider(92051595, 'ARASMP');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/cargo-providers',
        body: { cargoProvider: 'ARASMP' },
      }),
    );
  });

  it('accepts arbitrary provider codes (open enum)', async () => {
    const transport = mockTransport();
    await r(transport).changeCargoProvider(1, 'NEWPROVIDER');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.body).toMatchObject({ cargoProvider: 'NEWPROVIDER' });
  });
});

describe('OrdersResource.manualDeliverByPackageId', () => {
  it('PUTs to /manual-invoice-delivery with no body', async () => {
    const transport = mockTransport();
    await r(transport).manualDeliverByPackageId(92051595);

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/92051595/manual-invoice-delivery',
    );
    expect(call.body).toBeUndefined();
  });
});

describe('OrdersResource.manualDeliverByTrackingNumber', () => {
  it('PUTs to the sibling tracking-number path with no body', async () => {
    const transport = mockTransport();
    await r(transport).manualDeliverByTrackingNumber('TRK12345');

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/manual-invoice-delivery-by-tracking-number/TRK12345',
    );
    expect(call.body).toBeUndefined();
  });

  it('url-encodes the tracking number', async () => {
    const transport = mockTransport();
    await r(transport).manualDeliverByTrackingNumber('weird tracking/id');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toContain('weird%20tracking%2Fid');
  });

  it('accepts numeric tracking numbers too', async () => {
    const transport = mockTransport();
    await r(transport).manualDeliverByTrackingNumber(9876543210);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/manual-invoice-delivery-by-tracking-number/9876543210',
    );
  });
});

describe('OrdersResource.markDeliveredByService', () => {
  it('PUTs to /delivered-by-service with no body', async () => {
    const transport = mockTransport();
    await r(transport).markDeliveredByService(92051595);

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe(
      '/integration/order/sellers/42/shipment-packages/92051595/delivered-by-service',
    );
    expect(call.body).toBeUndefined();
  });
});
