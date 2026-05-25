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
    writeLimiter: fastLimiter(),
    deleteLimiter: fastLimiter(),
  });
}

describe('ProductsResource.delete', () => {
  it('DELETEs /products with body { items: [{barcode}] }', async () => {
    const transport = mockTransport({ batchRequestId: 'd-1' });
    const result = await newResource(transport).delete(['B1', 'B2']);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        path: '/integration/product/sellers/42/products',
        body: { items: [{ barcode: 'B1' }, { barcode: 'B2' }] },
      }),
    );
    expect(result).toEqual({ batchRequestId: 'd-1' });
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport({});
    await expect(newResource(transport).delete([])).rejects.toThrow(/must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('throws ValidationError on > 1000 barcodes', async () => {
    const transport = mockTransport({});
    const tooMany = Array.from({ length: 1001 }, (_, i) => `B${i}`);
    await expect(newResource(transport).delete(tooMany)).rejects.toThrow(/max 1000/);
  });

  it('defaults batchRequestId to empty string when missing', async () => {
    const transport = mockTransport({});
    const result = await newResource(transport).delete(['B1']);
    expect(result).toEqual({ batchRequestId: '' });
  });
});

describe('ProductsResource.archive / unarchive', () => {
  it('archive PUTs to /products/archive-state with archived=true', async () => {
    const transport = mockTransport({ batchRequestId: 'a-1' });
    const result = await newResource(transport).archive(['B1', 'B2']);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/product/sellers/42/products/archive-state',
        body: {
          items: [
            { barcode: 'B1', archived: true },
            { barcode: 'B2', archived: true },
          ],
        },
      }),
    );
    expect(result).toEqual({ batchRequestId: 'a-1' });
  });

  it('unarchive PUTs to the same endpoint with archived=false', async () => {
    const transport = mockTransport({ batchRequestId: 'u-1' });
    await newResource(transport).unarchive(['B1']);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/product/sellers/42/products/archive-state',
        body: { items: [{ barcode: 'B1', archived: false }] },
      }),
    );
  });

  it('archive throws ValidationError on empty input', async () => {
    const transport = mockTransport({});
    await expect(newResource(transport).archive([])).rejects.toThrow(/must not be empty/);
  });

  it('unarchive throws ValidationError on > 1000 barcodes', async () => {
    const transport = mockTransport({});
    const tooMany = Array.from({ length: 1001 }, (_, i) => `B${i}`);
    await expect(newResource(transport).unarchive(tooMany)).rejects.toThrow(/max 1000/);
  });
});

describe('ProductsResource.unlock', () => {
  it('PUTs to /products/unlock with body { items: [{barcode}] }', async () => {
    const transport = mockTransport({ batchRequestId: 'k-1' });
    const result = await newResource(transport).unlock(['B1', 'B2']);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/product/sellers/42/products/unlock',
        body: { items: [{ barcode: 'B1' }, { barcode: 'B2' }] },
      }),
    );
    expect(result).toEqual({ batchRequestId: 'k-1' });
  });

  it('throws ValidationError on empty input', async () => {
    const transport = mockTransport({});
    await expect(newResource(transport).unlock([])).rejects.toThrow(/must not be empty/);
  });

  it('throws ValidationError on > 1000 barcodes', async () => {
    const transport = mockTransport({});
    const tooMany = Array.from({ length: 1001 }, (_, i) => `B${i}`);
    await expect(newResource(transport).unlock(tooMany)).rejects.toThrow(/max 1000/);
  });
});
