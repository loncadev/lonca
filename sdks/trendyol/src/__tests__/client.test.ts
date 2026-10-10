import { describe, expect, it, vi } from 'vitest';
import { createTrendyolClient } from '../client.js';

describe('createTrendyolClient', () => {
  it('routes requests through a custom fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ brands: [{ id: 1, name: 'Lonca' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = createTrendyolClient({
      sellerId: 42,
      apiKey: 'key',
      apiSecret: 'secret',
      env: 'stage',
      integratorName: 'SelfIntegration',
      fetch: fetchMock,
    });

    const page = await client.brands.list({ limit: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/integration/product/brands');
    expect(page.items[0]).toMatchObject({ id: '1', name: 'Lonca' });
  });
});
