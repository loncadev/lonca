import { describe, expect, it } from 'vitest';
import { createFakeTrendyolClient } from '../testing.js';

describe('createFakeTrendyolClient', () => {
  it('exposes capabilities like a real client', () => {
    const client = createFakeTrendyolClient();
    expect(client.capabilities.scheduledPricing).toBe(false);
    expect(client.capabilities.stockOnlyBatch).toBe(true);
  });

  it('inventory.update returns the seeded batchRequestId', async () => {
    const client = createFakeTrendyolClient({ batchRequestId: 'b-seeded' });
    const { batchRequestId } = await client.inventory.update([{ barcode: 'X', quantity: 1 }]);
    expect(batchRequestId).toBe('b-seeded');
  });

  it('updateAndWait resolves via the default COMPLETED batch status', async () => {
    const client = createFakeTrendyolClient({ batchRequestId: 'b1' });
    const results = await client.inventory.updateAndWait([{ barcode: 'X', quantity: 1 }], {
      pollIntervalMs: 1,
    });
    expect(results.map((r) => r.status)).toEqual(['COMPLETED']);
  });

  it('routes through a custom handler when one is provided', async () => {
    const client = createFakeTrendyolClient({
      handler: (req) =>
        req.path.endsWith('/price-and-inventory') ? { batchRequestId: 'from-handler' } : undefined,
    });
    const { batchRequestId } = await client.inventory.update([{ barcode: 'X', quantity: 1 }]);
    expect(batchRequestId).toBe('from-handler');
  });
});
