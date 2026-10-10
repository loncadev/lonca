import { createRequester, type BaseRequestOptions, type Logger } from '@lonca/core';
import { mapHttpError } from './errors.js';

/**
 * n11 base URLs.
 *
 * Every REST page of the developer portal (developer.n11.com/documentation) uses
 * `https://api.n11.com`, under three path families: `/cdn/...` (categories),
 * `/ms/...` (products) and `/rest/...` (orders). The legacy SOAP services live
 * under `/ws/...` on the same host. The portal documents **no sandbox / test
 * environment**, so only `prod` exists for now (open question — see RESEARCH.md).
 */
const BASE_URLS = {
  prod: 'https://api.n11.com',
} as const;

export type N11Environment = keyof typeof BASE_URLS;

export interface TransportConfig {
  /** n11 API key, created in the n11 Seller Office (so.n11.com). Sent as the `appkey` header. */
  appKey: string;
  /** n11 API secret. Sent as the `appsecret` header. */
  appSecret: string;
  /** Which n11 environment to target. Only `'prod'` is documented. */
  env: N11Environment;
  /**
   * Integrator name. n11 asks for it in the `integrator` field of every product
   * write task ("use the same value in all your requests"). Kept on the
   * transport so write resources can read it; no header carries it today.
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path beginning with `/` (e.g. `/ms/product-query`). */
  path: string;
  /**
   * Query parameters. `undefined` values are skipped; array values are joined
   * with commas (n11's `categoryIds` is documented as a "long list" — the exact
   * wire encoding is unverified, see RESEARCH.md).
   */
  query?: Record<string, string | number | boolean | readonly (string | number)[] | undefined>;
}

/**
 * REST transport for n11's JSON services.
 *
 * Auth is two plain headers, `appkey` and `appsecret` — every REST page says
 * "Authorization: no auth; add appKey and appSecret to Headers". The SOAP
 * services (questions, returns, invoice links, catalog search) carry the same
 * key pair inside the envelope's `auth` element instead; they are not wired yet.
 */
export class N11Transport {
  private readonly baseUrl: string;
  private readonly requester: <T>(opts: RequestOptions) => Promise<T>;

  constructor(private readonly config: TransportConfig) {
    this.baseUrl = BASE_URLS[config.env];
    this.requester = createRequester<RequestOptions>({
      fetch: config.fetch ?? fetch,
      logger: config.logger,
      timeoutMs: config.timeoutMs ?? 30_000,
      label: 'n11',
      logPrefix: 'n11',
      buildUrl: (opts) => this.buildUrl(opts.path, opts.query),
      buildHeaders: () => this.buildHeaders(),
      mapHttpError,
    });
  }

  /** Integrator name for the `integrator` field of product write tasks. */
  get integratorName(): string {
    return this.config.integratorName;
  }

  request<T>(opts: RequestOptions): Promise<T> {
    return this.requester<T>(opts);
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length === 0) continue;
          url.searchParams.set(key, value.join(','));
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(): Record<string, string> {
    // n11 documents no correlation-id or User-Agent convention, so none is
    // invented here; the SDK-generated correlation id still appears in the
    // `n11.request` / `n11.error` log lines.
    return {
      appkey: this.config.appKey,
      appsecret: this.config.appSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
