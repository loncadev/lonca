import {
  LoncaError,
  NetworkError,
  TimeoutError,
  noopLogger,
  retry,
  type Logger,
  type TokenBucketRateLimiter,
} from '@lonca/core';
import { mapHttpError, parseRetryAfter } from './errors.js';

/**
 * Hepsiburada exposes its marketplace API across several `*-external` hostnames,
 * each scoped to one product surface. Resources pick which service they need.
 *
 * The base URLs match the values published in Hepsiburada's developer portal
 * (developers.hepsiburada.com) per OpenAPI document.
 */
const BASE_URLS = {
  prod: {
    listing: 'https://listing-external.hepsiburada.com',
    oms: 'https://oms-external.hepsiburada.com',
    shipping: 'https://shipping-external.hepsiburada.com',
    'claim-stub': 'https://claim-stub-external.hepsiburada.com',
    'oms-stub': 'https://oms-stub-external.hepsiburada.com',
    mpop: 'https://mpop.hepsiburada.com',
  },
  sit: {
    listing: 'https://listing-external-sit.hepsiburada.com',
    oms: 'https://oms-external-sit.hepsiburada.com',
    shipping: 'https://shipping-external-sit.hepsiburada.com',
    'claim-stub': 'https://claim-stub-external-sit.hepsiburada.com',
    'oms-stub': 'https://oms-stub-external-sit.hepsiburada.com',
    mpop: 'https://mpop-sit.hepsiburada.com',
  },
} as const satisfies Record<string, Record<string, string>>;

export type HepsiburadaEnvironment = keyof typeof BASE_URLS;
export type HepsiburadaService = keyof (typeof BASE_URLS)[HepsiburadaEnvironment];

export interface TransportConfig {
  /** Hepsiburada merchant ID (UUID-shaped). Required on most paths. */
  merchantId: string;
  /** API username — from Hepsiburada Merchant Portal → Settings → Integrations. */
  username: string;
  /** API password (treat as a secret; rotatable from the portal). */
  password: string;
  /** Which Hepsiburada environment to target. */
  env: HepsiburadaEnvironment;
  /**
   * Integrator name sent in `User-Agent`. Required: Hepsiburada rejects
   * requests without a meaningful User-Agent.
   */
  integratorName: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /** Override the underlying `fetch` (tests inject a mock). */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Which Hepsiburada service to call; selects the base URL. */
  service: HepsiburadaService;
  /** Path beginning with `/` (e.g. `/listings/merchantid/<id>`). */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  /** Per-endpoint rate limiter; acquire one token before each attempt. */
  rateLimiter?: TokenBucketRateLimiter;
}

export class HepsiburadaTransport {
  private readonly env: HepsiburadaEnvironment;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly authHeader: string;

  constructor(private readonly config: TransportConfig) {
    this.env = config.env;
    this.logger = config.logger ?? noopLogger;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetch ?? fetch;
    this.authHeader =
      'Basic ' + Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64');
  }

  get merchantId(): string {
    return this.config.merchantId;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    return retry(
      async (attempt) => {
        if (opts.rateLimiter) await opts.rateLimiter.acquire(opts.signal);

        const url = this.buildUrl(opts.service, opts.path, opts.query);
        const headers = this.buildHeaders();
        const init: RequestInit = {
          method: opts.method,
          headers,
          signal: this.composeSignal(opts.signal),
        };
        if (opts.body !== undefined && opts.method !== 'GET') {
          if (opts.body instanceof FormData) {
            init.body = opts.body;
            delete (headers as Record<string, string>)['Content-Type'];
          } else {
            init.body = JSON.stringify(opts.body);
          }
        }

        this.logger.debug('hepsiburada.request', {
          method: opts.method,
          service: opts.service,
          url,
          attempt,
        });

        let response: Response;
        try {
          response = await this.fetchImpl(url, init);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new TimeoutError({
              message: `Hepsiburada request timed out after ${this.timeoutMs}ms`,
              cause: err,
            });
          }
          throw new NetworkError({
            message: 'Hepsiburada network failure',
            cause: err,
          });
        }

        if (!response.ok) {
          const body = await safeJson(response);
          const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
          const error = mapHttpError(response.status, body, retryAfterMs);
          this.logger.warn('hepsiburada.error', {
            method: opts.method,
            service: opts.service,
            url,
            status: response.status,
            code: error.code,
            retryable: error.retryable,
          });
          throw error;
        }

        this.logger.debug('hepsiburada.response', { status: response.status });

        if (response.status === 204) return undefined as T;
        return (await safeJson(response)) as T;
      },
      {
        signal: opts.signal,
        onRetry: (err, attempt, delay) => {
          if (err instanceof LoncaError) {
            this.logger.warn('hepsiburada.retry', {
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

  private buildUrl(
    service: HepsiburadaService,
    path: string,
    query?: RequestOptions['query'],
  ): string {
    const url = new URL(path, BASE_URLS[this.env][service]);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Hepsiburada requires a `User-Agent` on every request and rejects the
      // common `merchantId - integratorName` template with 401/403 on several
      // services (verified against SIT mpop/listings/oms in 2026-05). Use the
      // bare integrator name — what merchants configure server-side in their
      // Hepsiburada Merchant Portal.
      'User-Agent': this.config.integratorName,
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
