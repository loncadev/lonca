import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { WebhooksResource } from '../resources/webhooks.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport, sellerId = 42) => new WebhooksResource(t, sellerId, fastLimiter());

describe('WebhooksResource.create', () => {
  it('POSTs to /webhooks with the input body', async () => {
    const transport = mockTransport({ id: 'wh-1' });
    await r(transport).create({
      url: 'https://example.com/hook',
      authenticationType: 'API_KEY',
      apiKey: 'secret-1',
      subscribedStatuses: ['CREATED', 'SHIPPED'],
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/sellers/42/webhooks',
        body: {
          url: 'https://example.com/hook',
          authenticationType: 'API_KEY',
          apiKey: 'secret-1',
          subscribedStatuses: ['CREATED', 'SHIPPED'],
        },
      }),
    );
  });

  it('throws ValidationError on missing url', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create({ url: '', authenticationType: 'API_KEY', apiKey: 'k' }),
    ).rejects.toThrow(/url is required/);
  });

  it('throws ValidationError on missing authenticationType', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create({
        url: 'x',
        authenticationType: 'OTHER' as unknown as 'API_KEY',
      }),
    ).rejects.toThrow(/authenticationType must be/);
  });

  it('BASIC_AUTHENTICATION requires username + password', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create({ url: 'x', authenticationType: 'BASIC_AUTHENTICATION' }),
    ).rejects.toThrow(/username \+ password/);
  });

  it('API_KEY requires apiKey', async () => {
    const transport = mockTransport();
    await expect(r(transport).create({ url: 'x', authenticationType: 'API_KEY' })).rejects.toThrow(
      /apiKey/,
    );
  });
});

describe('WebhooksResource.list', () => {
  it('GETs /webhooks', async () => {
    const transport = mockTransport([
      { id: 1, url: 'https://x/h1', authenticationType: 'API_KEY', active: true },
      { id: 2, url: 'https://x/h2', authenticationType: 'BASIC_AUTHENTICATION', isActive: false },
    ]);

    const result = await r(transport).list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/integration/sellers/42/webhooks' }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: '1', url: 'https://x/h1', active: true });
    expect(result[1]).toMatchObject({ id: '2', active: false });
  });

  it('accepts { webhooks: [...] } wrapper too', async () => {
    const transport = mockTransport({ webhooks: [{ id: 5, status: 'ACTIVE' }] });
    const result = await r(transport).list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: '5', active: true });
  });

  it('accepts { content: [...] } wrapper too', async () => {
    const transport = mockTransport({ content: [{ id: 7, status: 'INACTIVE' }] });
    const result = await r(transport).list();
    expect(result[0]).toMatchObject({ id: '7', active: false });
  });

  it('returns [] when the response is empty', async () => {
    const transport = mockTransport({});
    expect(await r(transport).list()).toEqual([]);
  });
});

describe('WebhooksResource.update', () => {
  it('PUTs to /webhooks/{id} with the input body', async () => {
    const transport = mockTransport();
    await r(transport).update('wh-1', {
      url: 'https://example.com/v2',
      authenticationType: 'BASIC_AUTHENTICATION',
      username: 'u',
      password: 'p',
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/sellers/42/webhooks/wh-1',
        body: {
          url: 'https://example.com/v2',
          authenticationType: 'BASIC_AUTHENTICATION',
          username: 'u',
          password: 'p',
        },
      }),
    );
  });

  it('url-encodes the webhook id', async () => {
    const transport = mockTransport();
    await r(transport).update('weird id/1', {
      url: 'x',
      authenticationType: 'API_KEY',
      apiKey: 'k',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/sellers/42/webhooks/weird%20id%2F1');
  });

  it('runs the same validation as create', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).update('wh-1', { url: '', authenticationType: 'API_KEY', apiKey: 'k' }),
    ).rejects.toThrow(/url is required/);
  });
});

describe('WebhooksResource.delete', () => {
  it('DELETEs /webhooks/{id} with no body', async () => {
    const transport = mockTransport();
    await r(transport).delete('wh-1');

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('DELETE');
    expect(call.path).toBe('/integration/sellers/42/webhooks/wh-1');
    expect(call.body).toBeUndefined();
  });
});

describe('WebhooksResource.activate / deactivate', () => {
  it('activate PUTs to /webhooks/{id}/activate with no body', async () => {
    const transport = mockTransport();
    await r(transport).activate('wh-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/integration/sellers/42/webhooks/wh-1/activate');
    expect(call.body).toBeUndefined();
  });

  it('deactivate PUTs to /webhooks/{id}/deactivate with no body', async () => {
    const transport = mockTransport();
    await r(transport).deactivate('wh-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/integration/sellers/42/webhooks/wh-1/deactivate');
  });
});
