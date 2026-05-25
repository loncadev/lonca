import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { BrandsResource } from '../resources/brands.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

// A high-capacity limiter so rate limit acquire never blocks our tests.
function fastLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
}

describe('BrandsResource.list', () => {
  it('hits the brands endpoint with default page=0 and size=1000', async () => {
    const transport = mockTransport({ brands: [], totalPages: 0, totalElements: 0 });
    const resource = new BrandsResource(transport, fastLimiter());

    await resource.list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/sapigw/brands',
        query: { page: 0, size: 1000 },
      }),
    );
  });

  it('passes a custom limit through as the page size', async () => {
    const transport = mockTransport({ brands: [], totalPages: 0, totalElements: 0 });
    const resource = new BrandsResource(transport, fastLimiter());

    await resource.list({ limit: 50 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 0, size: 50 } }),
    );
  });

  it('uses cursor as the (numeric) page index', async () => {
    const transport = mockTransport({ brands: [], totalPages: 5, totalElements: 0 });
    const resource = new BrandsResource(transport, fastLimiter());

    await resource.list({ cursor: '3', limit: 100 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 3, size: 100 } }),
    );
  });

  it('normalizes numeric IDs to strings (per @lonca/core convention)', async () => {
    const transport = mockTransport({
      brands: [
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Nike' },
      ],
      totalPages: 1,
      totalElements: 2,
    });
    const resource = new BrandsResource(transport, fastLimiter());

    const page = await resource.list();

    expect(page.items).toEqual([
      { id: '1', name: 'Apple' },
      { id: '2', name: 'Nike' },
    ]);
  });

  it('returns nextCursor when more pages exist', async () => {
    const transport = mockTransport({ brands: [], totalPages: 5, totalElements: 5000 });
    const resource = new BrandsResource(transport, fastLimiter());

    const page = await resource.list({ cursor: '1' });

    expect(page.nextCursor).toBe('2');
  });

  it('omits nextCursor on the final page', async () => {
    const transport = mockTransport({ brands: [], totalPages: 3, totalElements: 3000 });
    const resource = new BrandsResource(transport, fastLimiter());

    const page = await resource.list({ cursor: '2' });

    expect(page.nextCursor).toBeUndefined();
  });
});
