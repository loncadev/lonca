import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@lonca/core';
import { InventoryResource } from '../resources/inventory.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

describe('InventoryResource.update', () => {
  it('POSTs to /inventory/sellers/{sellerId}/products/price-and-inventory', async () => {
    const transport = mockTransport({ batchRequestId: 'abc' });
    const resource = new InventoryResource(transport);

    await resource.update([{ barcode: 'X1', quantity: 10 }]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/inventory/sellers/42/products/price-and-inventory',
      }),
    );
  });

  it('sends the items array as the request body verbatim', async () => {
    const transport = mockTransport({ batchRequestId: 'abc' });
    const resource = new InventoryResource(transport);

    const items = [
      { barcode: 'X1', quantity: 10, salePrice: 99.9, listPrice: 129.9 },
      { barcode: 'X2', quantity: 0 },
    ];
    await resource.update(items);

    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ body: { items } }));
  });

  it('returns the batchRequestId', async () => {
    const transport = mockTransport({ batchRequestId: 'batch-123' });
    const resource = new InventoryResource(transport);

    const result = await resource.update([{ barcode: 'X', quantity: 1 }]);

    expect(result).toEqual({ batchRequestId: 'batch-123' });
  });

  it('handles a missing batchRequestId defensively', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    const result = await resource.update([{ barcode: 'X', quantity: 1 }]);

    expect(result.batchRequestId).toBe('');
  });

  it('rejects an empty items array with ValidationError', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    await expect(resource.update([])).rejects.toBeInstanceOf(ValidationError);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('rejects more than 1000 items with ValidationError', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    const items = Array.from({ length: 1001 }, (_, i) => ({ barcode: `B${i}`, quantity: 1 }));

    await expect(resource.update(items)).rejects.toBeInstanceOf(ValidationError);
    expect(transport.request).not.toHaveBeenCalled();
  });
});
