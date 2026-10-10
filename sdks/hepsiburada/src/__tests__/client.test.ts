import { describe, expect, it, vi } from 'vitest';
import { createHepsiburadaClient } from '../client.js';

describe('createHepsiburadaClient', () => {
  it('routes requests through a custom fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ cargoFirms: [{ name: 'Lonca Kargo' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = createHepsiburadaClient({
      merchantId: 'merchant-1',
      username: 'user',
      password: 'pass',
      env: 'sit',
      integratorName: 'Lonca',
      fetch: fetchMock,
    });

    const firms = await client.shipping.getCargoFirms();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/cargoFirms/merchant-1');
    expect(firms).toHaveLength(1);
  });
});
