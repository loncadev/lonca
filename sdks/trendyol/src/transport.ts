import { randomUUID } from 'node:crypto';
import {
  LoncaError,
  NetworkError,
  TimeoutError,
  retry,
  noopLogger,
  type Logger,
  type TokenBucketRateLimiter,
} from '@lonca/core';
import { buildAuthHeader, buildUserAgent } from './auth.js';
import { mapHttpError, parseRetryAfter } from './errors.js';

const BASE_URLS = {
  prod: 'https://apigw.trendyol.com',
  stage: 'https://stageapigw.trendyol.com',
} as const;

export type TrendyolEnvironment = keyof typeof BASE_URLS;

export interface TransportConfig {
  sellerId: number;
  apiKey: string;
  apiSecret: string;
  env: TrendyolEnvironment;
  integratorName: string;
  clientIp?: string;
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /** Override the underlying `fetch` (tests inject a mock). */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path beginning with `/` (e.g., `/sapigw/brands`). */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Extra per-request headers merged over the default header set (caller
   * headers win). Used for endpoint-specific headers like `storeFrontCode`.
   */
  headers?: Record<string, string>;
  /** Per-endpoint rate limiter; acquire one token before each attempt. */
  rateLimiter?: TokenBucketRateLimiter;
}

export class TrendyolTransport {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TransportConfig) {
    this.baseUrl = BASE_URLS[config.env];
    this.logger = config.logger ?? noopLogger;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetch ?? fetch;
  }

  /** Seller ID this transport is configured with. Resources read it for path-building. */
  get sellerId(): number {
    return this.config.sellerId;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    return retry(
      async (attempt) => {
        if (opts.rateLimiter) await opts.rateLimiter.acquire(opts.signal);

        const url = this.buildUrl(opts.path, opts.query);
        const correlationId = randomUUID();
        const headers = { ...this.buildHeaders(correlationId), ...opts.headers };
        const init: RequestInit = {
          method: opts.method,
          headers,
          signal: this.composeSignal(opts.signal),
        };
        if (opts.body !== undefined && opts.method !== 'GET') {
          if (opts.body instanceof FormData) {
            // multipart: let fetch set Content-Type (it includes the boundary).
            init.body = opts.body;
            delete (headers as Record<string, string>)['Content-Type'];
          } else {
            init.body = JSON.stringify(opts.body);
          }
        }

        this.logger.debug('trendyol.request', {
          method: opts.method,
          url,
          correlationId,
          attempt,
        });

        let response: Response;
        try {
          response = await this.fetchImpl(url, init);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new TimeoutError({
              message: `Trendyol request timed out after ${this.timeoutMs}ms`,
              cause: err,
            });
          }
          throw new NetworkError({
            message: 'Trendyol network failure',
            cause: err,
          });
        }

        if (!response.ok) {
          const body = await safeJson(response);
          const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
          const error = mapHttpError(response.status, body, retryAfterMs);
          this.logger.warn('trendyol.error', {
            method: opts.method,
            url,
            correlationId,
            status: response.status,
            code: error.code,
            retryable: error.retryable,
          });
          throw error;
        }

        this.logger.debug('trendyol.response', {
          correlationId,
          status: response.status,
        });

        if (response.status === 204) return undefined as T;
        return (await safeJson(response)) as T;
      },
      {
        signal: opts.signal,
        onRetry: (err, attempt, delay) => {
          if (err instanceof LoncaError) {
            this.logger.warn('trendyol.retry', {
              attempt,
              delayMs: delay,
              code: err.code,
              status: err.status,
            });
          }
        },
      },
    );
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(correlationId: string): Record<string, string> {
    return {
      Authorization: buildAuthHeader(this.config.apiKey, this.config.apiSecret),
      'x-clientip': this.config.clientIp ?? '127.0.0.1',
      'x-correlationid': correlationId,
      'x-agentname': this.config.integratorName,
      'User-Agent': buildUserAgent(this.config.sellerId, this.config.integratorName),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private composeSignal(external?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    if (!external) return timeoutSignal;
    return AbortSignal.any([external, timeoutSignal]);
  }
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
