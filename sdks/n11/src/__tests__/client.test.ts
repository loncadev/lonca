import { describe, expect, it, vi } from 'vitest';
import { createN11Client, n11Capabilities, ProductsResource } from '../index.js';

describe('createN11Client', () => {
  it('wires the products resource and capabilities', () => {
    const client = createN11Client({
      appKey: 'k',
      appSecret: 's',
      env: 'prod',
      integratorName: 'TestIntegrator',
    });
    expect(client.products).toBeInstanceOf(ProductsResource);
    expect(client.capabilities).toBe(n11Capabilities);
  });

  it('routes requests through the injected fetch with the configured credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [], totalPages: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createN11Client({
      appKey: 'key-1',
      appSecret: 'secret-1',
      env: 'prod',
      integratorName: 'TestIntegrator',
      fetch: fetchMock,
      timeoutMs: 5_000,
    });

    await expect(client.products.list()).resolves.toEqual({ items: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.n11.com/ms/product-query?page=0&size=20');
    expect(init.headers).toMatchObject({ appkey: 'key-1', appsecret: 'secret-1' });
  });
});
