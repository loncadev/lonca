import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '../resources/orders.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new OrdersResource(t, fastLimiter());

describe('OrdersResource.updateBoxInfo', () => {
  it('PUTs to /box-info with the input body', async () => {
    const transport = mockTransport();
    await r(transport).updateBoxInfo(92051595, { deci: 2.5, boxQuantity: 1 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/box-info',
        body: { deci: 2.5, boxQuantity: 1 },
      }),
    );
  });

  it('accepts partial input (only deci, or only boxQuantity)', async () => {
    const transport = mockTransport();
    await r(transport).updateBoxInfo(1, { deci: 3 });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ body: { deci: 3 } }));
  });
});

describe('OrdersResource.updateLaborCosts', () => {
  it('PUTs to /labor-costs with the items array RAW (no envelope)', async () => {
    const transport = mockTransport();
    await r(transport).updateLaborCosts(92051595, [
      { orderLineId: 3653527482, laborCostPerItem: 32.12 },
      { orderLineId: 3653527483, laborCostPerItem: 78.65 },
    ]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/labor-costs',
        body: [
          { orderLineId: 3653527482, laborCostPerItem: 32.12 },
          { orderLineId: 3653527483, laborCostPerItem: 78.65 },
        ],
      }),
    );
  });

  it('throws ValidationError on empty items', async () => {
    const transport = mockTransport();
    await expect(r(transport).updateLaborCosts(1, [])).rejects.toThrow(/must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('OrdersResource.updateWarehouse', () => {
  it('PUTs to /warehouse with { warehouseId }', async () => {
    const transport = mockTransport();
    await r(transport).updateWarehouse(92051595, 1077925);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/shipment-packages/92051595/warehouse',
        body: { warehouseId: 1077925 },
      }),
    );
  });
});
