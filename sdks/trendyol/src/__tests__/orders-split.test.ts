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

describe('OrdersResource.splitPackage', () => {
  it('POSTs to /split with { orderLineIds }', async () => {
    const transport = mockTransport();
    await r(transport).splitPackage(92051595, [123, 456]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/order/sellers/42/shipment-packages/92051595/split',
        body: { orderLineIds: [123, 456] },
      }),
    );
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport();
    await expect(r(transport).splitPackage(1, [])).rejects.toThrow(/must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('OrdersResource.splitPackageByQuantity', () => {
  it('POSTs to /quantity-split with { quantitySplit }', async () => {
    const transport = mockTransport();
    await r(transport).splitPackageByQuantity(92051595, [
      { orderLineId: 100, quantities: [2, 2, 1] },
    ]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/order/sellers/42/shipment-packages/92051595/quantity-split',
        body: { quantitySplit: [{ orderLineId: 100, quantities: [2, 2, 1] }] },
      }),
    );
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport();
    await expect(r(transport).splitPackageByQuantity(1, [])).rejects.toThrow(/must not be empty/);
  });
});

describe('OrdersResource.multiSplitPackage', () => {
  it('POSTs to /multi-split with { splitGroups }', async () => {
    const transport = mockTransport();
    await r(transport).multiSplitPackage(92051595, [
      { orderLineIds: [3, 5, 6] },
      { orderLineIds: [7, 8, 9] },
    ]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/order/sellers/42/shipment-packages/92051595/multi-split',
        body: {
          splitGroups: [{ orderLineIds: [3, 5, 6] }, { orderLineIds: [7, 8, 9] }],
        },
      }),
    );
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport();
    await expect(r(transport).multiSplitPackage(1, [])).rejects.toThrow(/must not be empty/);
  });
});

describe('OrdersResource.splitMultiPackagesByQuantity', () => {
  it('POSTs to /split-packages with { splitPackages }', async () => {
    const transport = mockTransport();
    await r(transport).splitMultiPackagesByQuantity(92051595, [
      {
        packageDetails: [
          { orderLineId: 12345, quantities: 2 },
          { orderLineId: 123456, quantities: 1 },
        ],
      },
    ]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/order/sellers/42/shipment-packages/92051595/split-packages',
        body: {
          splitPackages: [
            {
              packageDetails: [
                { orderLineId: 12345, quantities: 2 },
                { orderLineId: 123456, quantities: 1 },
              ],
            },
          ],
        },
      }),
    );
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport();
    await expect(r(transport).splitMultiPackagesByQuantity(1, [])).rejects.toThrow(
      /must not be empty/,
    );
  });
});
