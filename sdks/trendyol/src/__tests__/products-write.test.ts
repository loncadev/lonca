import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { ProductsResource } from '../resources/products.js';
import type { TrendyolTransport } from '../transport.js';
import type {
  CreateProductV2Input,
  UpdateContentInput,
  UpdateDeliveryInfoInput,
  UpdateUnapprovedInput,
  UpdateVariantInput,
} from '../types/product-write.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

function newResource(transport: TrendyolTransport) {
  return new ProductsResource(transport, {
    filterLimiter: fastLimiter(),
    batchLimiter: fastLimiter(),
    buyboxLimiter: fastLimiter(),
    writeLimiter: fastLimiter(),
  });
}

const sampleCreateItem: CreateProductV2Input = {
  barcode: 'LONCA-SMOKE-1',
  title: 'Smoke Test Product',
  productMainId: 'LONCA-MAIN-1',
  brandId: 12345,
  categoryId: 678,
  quantity: 10,
  stockCode: 'LONCA-SC-1',
  dimensionalWeight: 1.5,
  description: '<p>Smoke</p>',
  listPrice: 199.9,
  salePrice: 149.9,
  images: [{ url: 'https://cdn.example/img1.jpg' }],
  vatRate: 20,
  attributes: [{ attributeId: 47, attributeValueIds: [1, 2] }],
};

const sampleContentItem: UpdateContentInput = {
  contentId: 999,
  title: 'New title',
  description: '<p>New</p>',
};

const sampleVariantItem: UpdateVariantInput = {
  barcode: 'B1',
  stockCode: 'NEW-SC',
  vatRate: 20,
};

const sampleUnapprovedItem: UpdateUnapprovedInput = {
  barcode: 'B1',
  title: 'Patched draft',
};

const sampleDeliveryItem: UpdateDeliveryInfoInput = {
  barcode: 'B1',
  deliveryOptions: { deliveryDuration: 3, fastDeliveryType: 'FAST_DELIVERY' },
};

// Table-driven path + method coverage.
const cases: Array<{
  name: string;
  path: string;
  invoke: (r: ProductsResource) => Promise<unknown>;
  bodyItems: unknown[];
}> = [
  {
    name: 'create',
    path: '/integration/product/sellers/42/v2/products',
    invoke: (r) => r.create([sampleCreateItem]),
    bodyItems: [sampleCreateItem],
  },
  {
    name: 'updateContent',
    path: '/integration/product/sellers/42/products/content-bulk-update',
    invoke: (r) => r.updateContent([sampleContentItem]),
    bodyItems: [sampleContentItem],
  },
  {
    name: 'updateVariants',
    path: '/integration/product/sellers/42/products/variant-bulk-update',
    invoke: (r) => r.updateVariants([sampleVariantItem]),
    bodyItems: [sampleVariantItem],
  },
  {
    name: 'updateUnapproved',
    path: '/integration/product/sellers/42/products/unapproved-bulk-update',
    invoke: (r) => r.updateUnapproved([sampleUnapprovedItem]),
    bodyItems: [sampleUnapprovedItem],
  },
  {
    name: 'updateDeliveryInfo',
    path: '/integration/product/sellers/42/products/delivery-info-bulk-update',
    invoke: (r) => r.updateDeliveryInfo([sampleDeliveryItem]),
    bodyItems: [sampleDeliveryItem],
  },
];

describe.each(cases)('ProductsResource.$name (write)', ({ name, path, invoke, bodyItems }) => {
  it(`POSTs to ${path} with body { items }`, async () => {
    const transport = mockTransport({ batchRequestId: 'b-1' });
    const resource = newResource(transport);

    const result = await invoke(resource);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path,
        body: { items: bodyItems },
      }),
    );
    expect(result).toEqual({ batchRequestId: 'b-1' });
  });

  it(`${name} throws ValidationError on empty items`, async () => {
    const transport = mockTransport({ batchRequestId: 'never' });
    const resource = newResource(transport);
    const empty = invoke(
      new Proxy(resource, {
        get(target, prop) {
          if (prop === name) {
            return () =>
              (
                target[name as keyof ProductsResource] as (...args: unknown[]) => Promise<unknown>
              ).call(target, []);
          }
          return Reflect.get(target, prop);
        },
      }),
    );
    await expect(empty).rejects.toThrow(/items must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it(`${name} throws ValidationError on > 1000 items`, async () => {
    const transport = mockTransport({ batchRequestId: 'never' });
    const resource = newResource(transport);
    const tooMany = Array.from({ length: 1001 }, () => bodyItems[0]);
    const fn = resource[name as keyof ProductsResource] as (items: unknown[]) => Promise<unknown>;
    await expect(fn.call(resource, tooMany)).rejects.toThrow(/max 1000 items/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it(`${name} defaults batchRequestId to '' when response is partial`, async () => {
    const transport = mockTransport({});
    const resource = newResource(transport);
    const result = await invoke(resource);
    expect(result).toEqual({ batchRequestId: '' });
  });
});
