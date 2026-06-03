import { createRequester, type BaseRequestOptions, type Logger } from '@lonca/core';
import { mapHttpError } from './errors.js';

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

export interface RequestOptions extends BaseRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Which Hepsiburada service to call; selects the base URL. */
  service: HepsiburadaService;
  /** Path beginning with `/` (e.g. `/listings/merchantid/<id>`). */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export class HepsiburadaTransport {
  private readonly env: HepsiburadaEnvironment;
  private readonly authHeader: string;
  private readonly requester: <T>(opts: RequestOptions) => Promise<T>;

  constructor(private readonly config: TransportConfig) {
    this.env = config.env;
    this.authHeader =
      'Basic ' + Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64');
    this.requester = createRequester<RequestOptions>({
      fetch: config.fetch ?? fetch,
      logger: config.logger,
      timeoutMs: config.timeoutMs ?? 30_000,
      label: 'Hepsiburada',
      logPrefix: 'hepsiburada',
      buildUrl: (opts) => this.buildUrl(opts.service, opts.path, opts.query),
      buildHeaders: (correlationId) => this.buildHeaders(correlationId),
      mapHttpError,
      logFields: (opts) => ({ service: opts.service }),
    });
  }

  get merchantId(): string {
    return this.config.merchantId;
  }

  request<T>(opts: RequestOptions): Promise<T> {
    return this.requester<T>(opts);
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

  private buildHeaders(correlationId: string): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Echo the SDK-generated correlation ID. Hepsiburada doesn't currently
      // surface it back, but sending it makes downstream log correlation work
      // identically to the `@lonca/trendyol` SDK.
      'x-correlationid': correlationId,
      // Hepsiburada requires a `User-Agent` on every request and rejects the
      // common `merchantId - integratorName` template with 401/403 on several
      // services (verified against SIT mpop/listings/oms in 2026-05). Use the
      // bare integrator name — what merchants configure server-side in their
      // Hepsiburada Merchant Portal.
      'User-Agent': this.config.integratorName,
    };
  }
}
