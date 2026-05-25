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

  it('handles the live Trendyol V2 wire format: attributeValues omitted, categoryId echoed', async () => {
    // Verified against Trendyol PROD on 2026-05-25 (categoryId=387 "Saat").
    const transport = mockTransport({
      id: 387,
      categoryAttributes: [
        {
          allowCustom: true,
          attribute: { id: 47, name: 'Renk' },
          categoryId: 387,
          required: true,
          varianter: false,
          slicer: true,
          allowMultipleAttributeValues: false,
          // Note: live API omits `attributeValues` for many attributes.
        },
      ],
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const attrs = await resource.getAttributes(387);

    expect(attrs).toEqual([
      {
        id: '47',
        name: 'Renk',
        categoryId: '387',
        required: true,
        allowCustom: true,
        varianter: false,
        slicer: true,
        allowMultipleAttributeValues: false,
        values: [], // defensively defaulted when API omits the field
      },
    ]);
  });

  it('falls back to safe empty defaults when `attribute` is missing', async () => {
    const transport = mockTransport({
      id: 1,
      categoryAttributes: [{ required: true }],
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const attrs = await resource.getAttributes(1);

    expect(attrs[0]).toMatchObject({ id: '0', name: '', required: true, values: [] });
  });
});

describe('CategoriesResource.getAttributeValues', () => {
  it('hits the V2 values endpoint with page-based pagination', async () => {
    const transport = mockTransport({
      content: [{ attributeValueId: 1, attributeValue: 'Red' }],
      page: 0,
      size: 100,
      totalPages: 1,
      totalElements: 1,
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.getAttributeValues(387, 47);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/product/categories/387/attributes/47/values',
        query: { page: 0, size: 100 },
      }),
    );
  });

  it('normalizes the live wire shape (attributeValueId + attributeValue) verified on STAGE', async () => {
    // Verified against Trendyol STAGE on 2026-05-25 (cat=67302, attr=42737):
    //   { attributeValueId, attributeValue } — NOT `attributeValueName` from the spec.
    const transport = mockTransport({
      content: [
        { attributeValueId: 269969, attributeValue: 'berkay2' },
        { attributeValueId: 269970, attributeValue: 'berkay3' },
      ],
      page: 0,
      size: 10,
      totalPages: 1,
      totalElements: 2,
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const page = await resource.getAttributeValues(67302, 42737, { limit: 10 });

    expect(page.items).toEqual([
      { id: '269969', name: 'berkay2' },
      { id: '269970', name: 'berkay3' },
    ]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('also accepts the spec-named `attributeValueName` field as a fallback', async () => {
    const transport = mockTransport({
      content: [{ attributeValueId: 5, attributeValueName: 'Large' }],
      page: 0,
      size: 100,
      totalPages: 1,
      totalElements: 1,
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const page = await resource.getAttributeValues(1, 2);

    expect(page.items).toEqual([{ id: '5', name: 'Large' }]);
  });

  it('emits nextCursor when more pages remain', async () => {
    const transport = mockTransport({
      content: [{ attributeValueId: 1, attributeValue: 'a' }],
      page: 0,
      size: 1,
      totalPages: 3,
      totalElements: 3,
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    const page = await resource.getAttributeValues(1, 2, { limit: 1 });

    expect(page.nextCursor).toBe('1');
  });

  it('forwards the cursor as the next page index', async () => {
    const transport = mockTransport({
      content: [],
      page: 2,
      size: 100,
      totalPages: 3,
      totalElements: 250,
    });
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.getAttributeValues(1, 2, { cursor: '2' });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { page: 2, size: 100 },
      }),
    );
  });

  it('caps size at Trendyol`s 1000 max', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    const resource = new CategoriesResource(transport, fastLimiter());

    await resource.getAttributeValues(1, 2, { limit: 5000 });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 0, size: 1000 } }),
    );
  });
});
