import { describe, expect, it, vi } from 'vitest';
import { AuthError, NetworkError, RateLimitError } from '@lonca/core';
import { TrendyolTransport } from '../transport.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/**
 * Fetch mock that returns a fresh Response per call.
 * A Response body can only be read once, so reusing the same Response object
 * across calls throws "Body is unusable".
 */
function fetchOkJson(body: unknown, init: ResponseInit = {}) {
  return vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body, init)));
}

function fetchStatus(status: number, body = '{}', headers: HeadersInit = {}) {
  return vi.fn().mockImplementation(() => Promise.resolve(new Response(body, { status, headers })));
}

function makeTransport(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof TrendyolTransport>[0]> = {},
) {
  return new TrendyolTransport({
    sellerId: 1234,
    apiKey: 'k',
    apiSecret: 's',
    env: 'stage',
    fetch: fetchImpl,
    ...overrides,
  });
}

describe('TrendyolTransport', () => {
  it('sends all 5 required Trendyol headers + Content-Type/Accept', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const transport = makeTransport(fetchMock);

    await transport.request({ method: 'GET', path: '/sapigw/brands' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers['x-clientip']).toBe('127.0.0.1');
    expect(headers['x-correlationid']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-agentname']).toBe('SelfIntegration');
    expect(headers['User-Agent']).toBe('1234 - SelfIntegration');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('generates a fresh correlation ID per request', async () => {
    const fetchMock = fetchOkJson({});
    const transport = makeTransport(fetchMock);

    await transport.request({ method: 'GET', path: '/sapigw/brands' });
    await transport.request({ method: 'GET', path: '/sapigw/brands' });

    const headers1 = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    const headers2 = fetchMock.mock.calls[1]![1].headers as Record<string, string>;
    expect(headers1['x-correlationid']).not.toBe(headers2['x-correlationid']);
  });

  it('builds the URL against the env-specific base and serializes query params', async () => {
    const fetchMock = fetchOkJson({});
    const stage = makeTransport(fetchMock, { env: 'stage' });
    await stage.request({ method: 'GET', path: '/sapigw/brands', query: { page: 2, size: 100 } });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://stageapigw.trendyol.com/sapigw/brands?page=2&size=100',
    );

    fetchMock.mockClear();
    const prod = makeTransport(fetchMock, { env: 'prod' });
    await prod.request({ method: 'GET', path: '/sapigw/brands' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://apigw.trendyol.com/sapigw/brands');
  });

  it('skips undefined query params', async () => {
    const fetchMock = fetchOkJson({});
    const transport = makeTransport(fetchMock);
    await transport.request({
      method: 'GET',
      path: '/sapigw/brands',
      query: { page: 0, missing: undefined },
    });
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('page=0');
    expect(url).not.toContain('missing');
  });

  it('serializes request body as JSON for non-GET requests', async () => {
    const fetchMock = fetchOkJson({});
    const transport = makeTransport(fetchMock);

    await transport.request({
      method: 'POST',
      path: '/sapigw/products',
      body: { items: [{ barcode: 'X' }] },
    });

    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBe(JSON.stringify({ items: [{ barcode: 'X' }] }));
  });

  it('returns parsed JSON on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ brands: [{ id: 1, name: 'X' }] }));
    const transport = makeTransport(fetchMock);

    const result = await transport.request<{ brands: Array<{ id: number; name: string }> }>({
      method: 'GET',
      path: '/sapigw/brands',
    });

    expect(result.brands).toEqual([{ id: 1, name: 'X' }]);
  });

  it('returns undefined on 204 No Content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = makeTransport(fetchMock);
    const result = await transport.request({ method: 'DELETE', path: '/sapigw/products/X' });
    expect(result).toBeUndefined();
  });

  it('maps an HTTP error to the corresponding LoncaError (no retry on 401)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ exception: 'ClientApiAuthenticationException' }, { status: 401 }),
      );
    const transport = makeTransport(fetchMock);

    await expect(
      transport.request({ method: 'GET', path: '/sapigw/brands' }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries on 429 (RateLimitError) and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const transport = makeTransport(fetchMock);

    const result = await transport.request<{ ok: boolean }>({
      method: 'GET',
      path: '/sapigw/brands',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('eventually rethrows a RateLimitError after exhausting retries', async () => {
    const fetchMock = fetchStatus(429, '{}', { 'retry-after': '0' });
    const transport = makeTransport(fetchMock);

    const assertion = expect(
      transport.request({ method: 'GET', path: '/sapigw/brands' }),
    ).rejects.toBeInstanceOf(RateLimitError);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3); // default maxAttempts in @lonca/core retry
  });

  it('wraps low-level network errors as NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const transport = makeTransport(fetchMock);

    const assertion = expect(
      transport.request({ method: 'GET', path: '/sapigw/brands' }),
    ).rejects.toBeInstanceOf(NetworkError);
    await assertion;
  });
});
