import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, paginate } from '@lonca/core';
import { BrandsResource } from '../resources/brands.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
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
        path: '/integration/product/brands',
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

  // Prod wire (probe baseline 2026-10-09) is `{ brands: [{ id, luxe, name }] }` — no
  // totalPages / totalElements. Pagination must still advance.
  describe('without totalPages (the prod wire shape)', () => {
    const brandsOf = (count: number, offset = 0) =>
      Array.from({ length: count }, (_, i) => ({
        id: offset + i + 1,
        name: `B${offset + i + 1}`,
        luxe: false,
      }));

    it('sets nextCursor after a full page', async () => {
      const transport = mockTransport({ brands: brandsOf(3) });
      const resource = new BrandsResource(transport, fastLimiter());

      const page = await resource.list({ cursor: '4', limit: 3 });

      expect(page.items).toHaveLength(3);
      expect(page.nextCursor).toBe('5');
    });

    it('treats a page larger than the limit as full (server ignores small sizes)', async () => {
      const transport = mockTransport({ brands: brandsOf(10) });
      const resource = new BrandsResource(transport, fastLimiter());

      const page = await resource.list({ limit: 3 });

      expect(page.nextCursor).toBe('1');
    });

    it('omits nextCursor after a short page', async () => {
      const transport = mockTransport({ brands: brandsOf(2) });
      const resource = new BrandsResource(transport, fastLimiter());

      const page = await resource.list({ cursor: '7', limit: 3 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeUndefined();
    });

    it('omits nextCursor on an empty page or a missing brands array', async () => {
      const resource1 = new BrandsResource(mockTransport({ brands: [] }), fastLimiter());
      const resource2 = new BrandsResource(mockTransport({}), fastLimiter());

      await expect(resource1.list({ limit: 3 })).resolves.toEqual({ items: [] });
      await expect(resource2.list({ limit: 3 })).resolves.toEqual({ items: [] });
    });

    it('still honours totalPages when Trendyol sends it, even after a full page', async () => {
      const transport = mockTransport({ brands: brandsOf(3), totalPages: 1, totalElements: 3 });
      const resource = new BrandsResource(transport, fastLimiter());

      const page = await resource.list({ limit: 3 });

      expect(page.nextCursor).toBeUndefined();
    });

    it('exposes the luxe flag and leaves it off when the wire lacks it', async () => {
      const transport = mockTransport({
        brands: [
          { id: 1, name: 'Gucci', luxe: true },
          { id: 2, name: 'Nike', luxe: false },
          { id: 3, name: 'Legacy' },
        ],
      });
      const resource = new BrandsResource(transport, fastLimiter());

      const page = await resource.list();

      expect(page.items).toEqual([
        { id: '1', name: 'Gucci', luxe: true },
        { id: '2', name: 'Nike', luxe: false },
        { id: '3', name: 'Legacy' },
      ]);
    });

    it('paginate() walks every page and stops after the short one', async () => {
      const pages = [brandsOf(3, 0), brandsOf(3, 3), brandsOf(1, 6)];
      const request = vi.fn(async (req: { query: { page: number } }) => ({
        brands: pages[req.query.page] ?? [],
      }));
      const transport = { sellerId: 42, request } as unknown as TrendyolTransport;
      const resource = new BrandsResource(transport, fastLimiter());

      const ids: string[] = [];
      for await (const brand of paginate((p) => resource.list(p), { limit: 3 })) {
        ids.push(brand.id);
      }

      expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls.map(([req]) => req.query.page)).toEqual([0, 1, 2]);
    });

    it('paginate() makes one extra empty request when the total is a multiple of the page size', async () => {
      const pages = [brandsOf(3, 0), brandsOf(3, 3)];
      const request = vi.fn(async (req: { query: { page: number } }) => ({
        brands: pages[req.query.page] ?? [],
      }));
      const transport = { sellerId: 42, request } as unknown as TrendyolTransport;
      const resource = new BrandsResource(transport, fastLimiter());

      const ids: string[] = [];
      for await (const brand of paginate((p) => resource.list(p), { limit: 3 })) {
        ids.push(brand.id);
      }

      expect(ids).toHaveLength(6);
      expect(request).toHaveBeenCalledTimes(3);
    });
  });
});

describe('BrandsResource.search', () => {
  it('maps the by-name response, including luxe when present', async () => {
    const transport = mockTransport([
      { id: 40, name: 'TRENDYOLMİLLA', luxe: false },
      { id: 41, name: 'Trendyol' },
    ]);
    const resource = new BrandsResource(transport, fastLimiter());

    await expect(resource.search('trendyol')).resolves.toEqual([
      { id: '40', name: 'TRENDYOLMİLLA', luxe: false },
      { id: '41', name: 'Trendyol' },
    ]);
  });
});
