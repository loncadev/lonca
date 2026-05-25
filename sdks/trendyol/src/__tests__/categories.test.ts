import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { CategoriesResource } from '../resources/categories.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

function fastLimiter() {
  return new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
}

describe('CategoriesResource.list', () => {
  it('hits the product-categories endpoint with no query', async () => {
    const transport = mockTransport([]);
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/product-categories',
      }),
    );
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0]).not.toHaveProperty(
      'query',
    );
  });

  it('normalizes IDs to strings and preserves the tree shape', async () => {
    const transport = mockTransport([
      {
        id: 1,
        name: 'Clothing',
        parentId: null,
        subCategories: [
          { id: 11, name: 'T-Shirts', parentId: 1, subCategories: [] },
          { id: 12, name: 'Pants', parentId: 1 },
        ],
      },
    ]);
    const resource = new CategoriesResource(transport, fastLimiter());

    const tree = await resource.list();

    expect(tree).toEqual([
      {
        id: '1',
        name: 'Clothing',
        parentId: null,
        subCategories: [
          { id: '11', name: 'T-Shirts', parentId: '1', subCategories: [] },
          { id: '12', name: 'Pants', parentId: '1', subCategories: [] },
        ],
      },
    ]);
  });

  it('treats missing subCategories as an empty array', async () => {
    const transport = mockTransport([{ id: 5, name: 'Leaf', parentId: null }]);
    const resource = new CategoriesResource(transport, fastLimiter());

    const tree = await resource.list();

    expect(tree[0]!.subCategories).toEqual([]);
  });
});

describe('CategoriesResource.getAttributes', () => {
  it('encodes the category ID into the URL path', async () => {
    const transport = mockTransport({ id: 42, categoryAttributes: [] });
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.getAttributes(42);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/categories/42/attributes',
      }),
    );
  });

  it('accepts string IDs and url-encodes them', async () => {
    const transport = mockTransport({ id: 1, categoryAttributes: [] });
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.getAttributes('weird id');

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/product/categories/weird%20id/attributes');
  });

  it('flattens the attribute shape with string IDs and value lists', async () => {
    const transport = mockTransport({
      id: 100,
      categoryAttributes: [
        {
          attribute: { id: 99, name: 'Color' },
          required: true,
          allowCustom: false,
          varianter: true,
          slicer: false,
          attributeValues: [
            { id: 1, name: 'Red' },
            { id: 2, name: 'Blue' },
          ],
        },
      ],
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const attrs = await resource.getAttributes(100);

    expect(attrs).toEqual([
      {
        id: '99',
        name: 'Color',
        required: true,
        allowCustom: false,
        varianter: true,
        slicer: false,
        values: [
          { id: '1', name: 'Red' },
          { id: '2', name: 'Blue' },
        ],
      },
    ]);
  });
});
