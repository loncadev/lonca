import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '@lonca/core';
import { N11Transport } from '../transport.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeTransport(fetchImpl: typeof fetch) {
  return new N11Transport({
    appKey: 'test-app-key',
    appSecret: 'test-app-secret',
    env: 'prod',
    integratorName: 'TestIntegrator',
    fetch: fetchImpl,
  });
}

describe('N11Transport', () => {
  it('sends the appkey / appsecret headers and JSON content headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const transport = makeTransport(fetchMock);

    await transport.request({ method: 'GET', path: '/ms/product-query' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toEqual({
      appkey: 'test-app-key',
      appsecret: 'test-app-secret',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  it('builds the URL on api.n11.com, skips undefined and empty-array params, joins arrays', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const transport = makeTransport(fetchMock);

    await transport.request({
      method: 'GET',
      path: '/ms/product-query',
      query: { page: 0, stockCode: undefined, categoryIds: [1001, 1002], brandName: 'Acme', x: [] },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.n11.com/ms/product-query?page=0&categoryIds=1001%2C1002&brandName=Acme',
    );
  });

  it('returns the parsed JSON body', async () => {
    const transport = makeTransport(vi.fn().mockResolvedValue(jsonResponse({ id: 7 })));
    await expect(transport.request({ method: 'GET', path: '/cdn/categories' })).resolves.toEqual({
      id: 7,
    });
  });

  it('maps a 401 to AuthError without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 401 }));
    const transport = makeTransport(fetchMock);

    await expect(
      transport.request({ method: 'GET', path: '/ms/product-query' }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('exposes the integrator name for write payloads', () => {
    expect(makeTransport(vi.fn()).integratorName).toBe('TestIntegrator');
  });
});
