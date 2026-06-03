import { createRequester, type BaseRequestOptions, type Logger } from '@lonca/core';
import { buildAuthHeader, buildUserAgent } from './auth.js';
import { mapHttpError } from './errors.js';

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

export interface RequestOptions extends BaseRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path beginning with `/` (e.g., `/sapigw/brands`). */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export class TrendyolTransport {
  private readonly baseUrl: string;
  private readonly requester: <T>(opts: RequestOptions) => Promise<T>;

  constructor(private readonly config: TransportConfig) {
    this.baseUrl = BASE_URLS[config.env];
    this.requester = createRequester<RequestOptions>({
      fetch: config.fetch ?? fetch,
      logger: config.logger,
      timeoutMs: config.timeoutMs ?? 30_000,
      label: 'Trendyol',
      logPrefix: 'trendyol',
      buildUrl: (opts) => this.buildUrl(opts.path, opts.query),
      buildHeaders: (correlationId) => this.buildHeaders(correlationId),
      mapHttpError,
    });
  }

  /** Seller ID this transport is configured with. Resources read it for path-building. */
  get sellerId(): number {
    return this.config.sellerId;
  }

  request<T>(opts: RequestOptions): Promise<T> {
    return this.requester<T>(opts);
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
}
