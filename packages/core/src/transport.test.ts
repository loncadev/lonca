import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoncaError, RateLimitError, ServerError, ValidationError } from './errors.js';
import type { Logger } from './logger.js';
import type { TokenBucketRateLimiter } from './rate-limiter.js';
import {
  composeSignal,
  createRequester,
  safeJson,
  type BaseRequestOptions,
  type RequesterConfig,
} from './transport.js';

interface TestOptions extends BaseRequestOptions {
  path?: string;
  service?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function spyLogger(): Logger & {
  debug: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as never;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  const opts = { message: `http ${status}`, status, retryAfterMs, data: { body } };
  if (status === 429) return new RateLimitError(opts);
  if (status >= 500) return new ServerError(opts);
  return new ValidationError(opts);
}

function makeRequester(overrides: Partial<RequesterConfig<TestOptions>> = {}) {
  const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
  const logger = spyLogger();
  const config: RequesterConfig<TestOptions> = {
    fetch: fetchMock,
    logger,
    timeoutMs: 5000,
    label: 'Test',
    logPrefix: 'test',
    buildUrl: (opts) => `https://api.example.com${opts.path ?? '/'}`,
    buildHeaders: (correlationId) => ({
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
    }),
    mapHttpError,
    ...overrides,
  };
  const request = createRequester(config);
  return { request, fetchMock: config.fetch as typeof fetchMock, logger };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createRequester', () => {
  describe('success path', () => {
    it('parses a JSON response body', async () => {
      const { request, fetchMock } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => jsonResponse({ id: 42 })),
      });
      await expect(request<{ id: number }>({ method: 'GET', path: '/x' })).resolves.toEqual({
        id: 42,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('builds the URL via buildUrl and passes the method', async () => {
      const { request, fetchMock } = makeRequester();
      await request({ method: 'GET', path: '/orders?page=1' });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.example.com/orders?page=1');
      expect((init as RequestInit).method).toBe('GET');
    });

    it('returns undefined for a 204 response', async () => {
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
      });
      await expect(request({ method: 'DELETE' })).resolves.toBeUndefined();
    });

    it('returns raw text when the body is not JSON', async () => {
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => new Response('OK, but not JSON', { status: 200 })),
      });
      await expect(request({ method: 'GET' })).resolves.toBe('OK, but not JSON');
    });

    it('returns undefined for an empty 200 body', async () => {
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => new Response('', { status: 200 })),
      });
      await expect(request({ method: 'GET' })).resolves.toBeUndefined();
    });

    it('logs request and response debug events with a correlation id', async () => {
      const { request, logger } = makeRequester({
        logFields: (opts) => ({ service: opts.service }),
      });
      await request({ method: 'GET', path: '/p', service: 'oms' });
      expect(logger.debug).toHaveBeenCalledWith(
        'test.request',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/p',
          attempt: 1,
          service: 'oms',
          correlationId: expect.stringMatching(UUID_RE),
        }),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'test.response',
        expect.objectContaining({ status: 200, correlationId: expect.stringMatching(UUID_RE) }),
      );
    });
  });

  describe('headers and body', () => {
    it('merges per-request headers over defaults, caller wins', async () => {
      const { request, fetchMock } = makeRequester();
      await request({ method: 'GET', headers: { 'Content-Type': 'text/csv', 'X-Extra': 'yes' } });
      const [, init] = fetchMock.mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('text/csv');
      expect(headers['X-Extra']).toBe('yes');
      expect(headers['X-Correlation-Id']).toMatch(UUID_RE);
    });

    it('serializes a POST body as JSON', async () => {
      const { request, fetchMock } = makeRequester();
      await request({ method: 'POST', body: { a: 1, b: 'x' } });
      const [, init] = fetchMock.mock.calls[0]!;
      expect((init as RequestInit).body).toBe(JSON.stringify({ a: 1, b: 'x' }));
    });

    it('never sends a body for GET even when one is provided', async () => {
      const { request, fetchMock } = makeRequester();
      await request({ method: 'GET', body: { ignored: true } });
      const [, init] = fetchMock.mock.calls[0]!;
      expect((init as RequestInit).body).toBeUndefined();
    });

    it('passes FormData through untouched and drops the Content-Type header', async () => {
      const { request, fetchMock } = makeRequester();
      const form = new FormData();
      form.append('file', 'contents');
      await request({ method: 'POST', body: form });
      const [, init] = fetchMock.mock.calls[0]!;
      expect((init as RequestInit).body).toBe(form);
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
      expect(headers['X-Correlation-Id']).toMatch(UUID_RE);
    });
  });

  describe('HTTP error mapping', () => {
    it('maps a non-2xx response through mapHttpError and logs a warn event', async () => {
      const mapSpy = vi.fn(mapHttpError);
      const { request, logger } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => jsonResponse({ reason: 'bad' }, { status: 400 })),
        mapHttpError: mapSpy,
      });
      await expect(request({ method: 'GET', path: '/bad' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        status: 400,
      });
      expect(mapSpy).toHaveBeenCalledWith(400, { reason: 'bad' }, undefined);
      expect(logger.warn).toHaveBeenCalledWith(
        'test.error',
        expect.objectContaining({
          status: 400,
          code: 'VALIDATION_FAILED',
          retryable: false,
          method: 'GET',
          url: 'https://api.example.com/bad',
        }),
      );
    });

    it('parses the Retry-After header into retryAfterMs for mapHttpError', async () => {
      const mapSpy = vi.fn(mapHttpError);
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(
          async () => new Response('"slow down"', { status: 429, headers: { 'retry-after': '2' } }),
        ),
        mapHttpError: mapSpy,
      });
      // POST so the 429 is not replayed forever under real timers: it retries,
      // so use maxAttempts via rejection after retries — instead assert on the
      // mapping only, with fake timers driving the backoff.
      vi.useFakeTimers();
      const promise = request({ method: 'POST' });
      const assertion = expect(promise).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      await vi.runAllTimersAsync();
      await assertion;
      expect(mapSpy).toHaveBeenCalledWith(429, 'slow down', 2000);
    });

    it('feeds a non-JSON error body to mapHttpError as raw text', async () => {
      const mapSpy = vi.fn(mapHttpError);
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(
          async () => new Response('<html>teapot</html>', { status: 418 }),
        ),
        mapHttpError: mapSpy,
      });
      await expect(request({ method: 'GET' })).rejects.toBeInstanceOf(LoncaError);
      expect(mapSpy).toHaveBeenCalledWith(418, '<html>teapot</html>', undefined);
    });
  });

  describe('network and timeout mapping', () => {
    it('wraps a fetch rejection in a NetworkError with the cause attached', async () => {
      const boom = new TypeError('fetch failed');
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => {
          throw boom;
        }),
      });
      // POST: NetworkError is retryable but non-idempotent writes do not replay it.
      const err = await request({ method: 'POST' }).catch((e: unknown) => e as LoncaError);
      expect(err).toMatchObject({ code: 'NETWORK_ERROR', message: 'Test network failure' });
      expect((err as LoncaError).cause).toBe(boom);
    });

    it('maps an AbortError from fetch to a TimeoutError naming the timeout', async () => {
      const abortErr = new Error('This operation was aborted');
      abortErr.name = 'AbortError';
      const { request } = makeRequester({
        fetch: vi.fn<typeof fetch>(async () => {
          throw abortErr;
        }),
      });
      const err = await request({ method: 'POST' }).catch((e: unknown) => e as LoncaError);
      expect(err).toMatchObject({
        code: 'TIMEOUT',
        message: 'Test request timed out after 5000ms',
      });
      expect((err as LoncaError).cause).toBe(abortErr);
    });
  });

  describe('retry behaviour', () => {
    it('retries a GET on 500 up to 3 attempts, then throws the last error', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, { status: 500 }));
      const { request, logger } = makeRequester({ fetch: fetchMock });
      const promise = request({ method: 'GET' });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        status: 500,
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'test.retry',
        expect.objectContaining({
          attempt: 1,
          code: 'SERVER_ERROR',
          status: 500,
          delayMs: expect.any(Number),
        }),
      );
    });

    it('recovers when a later attempt succeeds', async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ recovered: true }));
      const { request } = makeRequester({ fetch: fetchMock });
      const promise = request<{ recovered: boolean }>({ method: 'GET' });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses a fresh correlation id per attempt', async () => {
      vi.useFakeTimers();
      const seen: string[] = [];
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({}));
      const { request } = makeRequester({
        fetch: fetchMock,
        buildHeaders: (correlationId) => {
          seen.push(correlationId);
          return {};
        },
      });
      const promise = request({ method: 'GET' });
      await vi.runAllTimersAsync();
      await promise;
      expect(seen).toHaveLength(2);
      expect(seen[0]).toMatch(UUID_RE);
      expect(seen[1]).toMatch(UUID_RE);
      expect(seen[0]).not.toBe(seen[1]);
    });

    it('does not replay a non-idempotent POST on a 500', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, { status: 500 }));
      const { request } = makeRequester({ fetch: fetchMock });
      await expect(request({ method: 'POST' })).rejects.toMatchObject({ code: 'SERVER_ERROR' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('replays a non-idempotent POST on a 429 (rejected before processing)', async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
        .mockResolvedValueOnce(jsonResponse({ done: true }));
      const { request } = makeRequester({ fetch: fetchMock });
      const promise = request({ method: 'POST' });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ done: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('replays a write on 500 when explicitly marked idempotent', async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ done: true }));
      const { request } = makeRequester({ fetch: fetchMock });
      const promise = request({ method: 'PUT', idempotent: true });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ done: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('bubbles the abort reason instead of sleeping when the signal aborts mid-flight', async () => {
      const ctrl = new AbortController();
      const reason = new Error('caller gave up');
      const fetchMock = vi.fn<typeof fetch>(async () => {
        ctrl.abort(reason);
        return jsonResponse({}, { status: 500 });
      });
      const { request } = makeRequester({ fetch: fetchMock });
      await expect(request({ method: 'GET', signal: ctrl.signal })).rejects.toBe(reason);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiter integration', () => {
    it('acquires one token before each attempt, passing the caller signal', async () => {
      vi.useFakeTimers();
      const acquire = vi.fn(async () => {});
      const rateLimiter = { acquire } as unknown as TokenBucketRateLimiter;
      const ctrl = new AbortController();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({}));
      const { request } = makeRequester({ fetch: fetchMock });
      const promise = request({ method: 'GET', rateLimiter, signal: ctrl.signal });
      await vi.runAllTimersAsync();
      await promise;
      expect(acquire).toHaveBeenCalledTimes(2);
      expect(acquire).toHaveBeenCalledWith(ctrl.signal);
      // The limiter gates the request: acquired before the first fetch.
      expect(acquire.mock.invocationCallOrder[0]!).toBeLessThan(
        fetchMock.mock.invocationCallOrder[0]!,
      );
    });

    it('propagates a rate limiter failure without wrapping it', async () => {
      const denied = new Error('limiter says no');
      const rateLimiter = {
        acquire: vi.fn(async () => {
          throw denied;
        }),
      } as unknown as TokenBucketRateLimiter;
      const { request, fetchMock } = makeRequester();
      await expect(request({ method: 'GET', rateLimiter })).rejects.toBe(denied);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('defaults to the noop logger when none is injected', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ quiet: true }));
    const request = createRequester<TestOptions>({
      fetch: fetchMock,
      timeoutMs: 5000,
      label: 'Test',
      logPrefix: 'test',
      buildUrl: () => 'https://api.example.com/',
      buildHeaders: () => ({}),
      mapHttpError,
    });
    await expect(request({ method: 'GET' })).resolves.toEqual({ quiet: true });
  });
});

describe('composeSignal', () => {
  it('returns a bare timeout signal when there is no external signal', () => {
    const signal = composeSignal(undefined, 5000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('is aborted immediately when the external signal is already aborted', () => {
    const ctrl = new AbortController();
    const reason = new Error('pre-aborted');
    ctrl.abort(reason);
    const signal = composeSignal(ctrl.signal, 5000);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
  });

  it('aborts when the external signal aborts later', () => {
    const ctrl = new AbortController();
    const signal = composeSignal(ctrl.signal, 5000);
    expect(signal.aborted).toBe(false);
    ctrl.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe('safeJson', () => {
  it('parses a JSON body', async () => {
    await expect(safeJson(new Response('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it('falls back to raw text for a non-JSON body', async () => {
    await expect(safeJson(new Response('plain text'))).resolves.toBe('plain text');
  });

  it('returns undefined for an empty body', async () => {
    await expect(safeJson(new Response(''))).resolves.toBeUndefined();
  });
});
