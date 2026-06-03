import { buildClient, type TrendyolClient } from './client.js';
import { TrendyolTransport } from './transport.js';
import type { BatchRequestStatus } from './types/product.js';

/** A request the fake client received, normalized for matching in a `handler`. */
export interface FakeTrendyolRequest {
  method: string;
  /** URL path only — no host, no query string. */
  path: string;
  /** Parsed query parameters. */
  query: URLSearchParams;
  /** Parsed JSON request body, when present. */
  body?: unknown;
}

export interface TrendyolFakeSeed {
  /**
   * Return the raw JSON the Trendyol API would respond with for a request, or
   * `undefined` to fall through to the built-in hot-path defaults.
   */
  handler?: (req: FakeTrendyolRequest) => unknown;
  /** `batchRequestId` returned by `inventory.update` and echoed by `getBatchStatus`. Default: `'fake-batch-1'`. */
  batchRequestId?: string;
  /** Terminal status `getBatchStatus` reports. Default: `'COMPLETED'`. */
  batchStatus?: BatchRequestStatus;
}

/**
 * Build an in-memory {@link TrendyolClient} for unit tests.
 *
 * It is the real client graph wired over a fake `fetch`, so your tests exercise
 * the SDK's real request building and response normalization — no network, no
 * structural-compat guessing. The batch hot-path
 * (`inventory.update` → `products.getBatchStatus` → `inventory.updateAndWait`)
 * works out of the box; drive any other endpoint with `seed.handler`.
 *
 * @example
 * ```ts
 * const client = createFakeTrendyolClient({ batchRequestId: 'b1' });
 * const [result] = await client.inventory.updateAndWait(
 *   [{ barcode: 'X', quantity: 1 }],
 *   { pollIntervalMs: 1 },
 * );
 * result.status; // 'COMPLETED'
 * ```
 */
export function createFakeTrendyolClient(seed: TrendyolFakeSeed = {}): TrendyolClient {
  const batchRequestId = seed.batchRequestId ?? 'fake-batch-1';
  const batchStatus = seed.batchStatus ?? 'COMPLETED';

  const fakeFetch: typeof fetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    const req: FakeTrendyolRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body: parseBody(init?.body),
    };

    const handled = seed.handler?.(req);
    const data =
      handled !== undefined ? handled : defaultResponse(req, batchRequestId, batchStatus);
    return Promise.resolve(jsonResponse(data));
  };

  const transport = new TrendyolTransport({
    sellerId: 1,
    apiKey: 'fake',
    apiSecret: 'fake',
    env: 'stage',
    integratorName: 'fake',
    fetch: fakeFetch,
  });

  return buildClient(transport);
}

function defaultResponse(
  req: FakeTrendyolRequest,
  batchRequestId: string,
  batchStatus: BatchRequestStatus,
): unknown {
  if (req.method === 'POST' && req.path.endsWith('/products/price-and-inventory')) {
    return { batchRequestId };
  }
  if (req.method === 'GET' && req.path.includes('/products/batch-requests/')) {
    const id = decodeURIComponent(req.path.split('/').pop() ?? batchRequestId);
    return { batchRequestId: id, status: batchStatus, itemCount: 0, failedItemCount: 0, items: [] };
  }
  return {};
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
