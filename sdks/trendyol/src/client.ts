import type { Logger } from '@lonca/core';
import { BrandsResource } from './resources/brands.js';
import { CategoriesResource } from './resources/categories.js';
import { ProductsResource } from './resources/products.js';
import { SuppliersResource } from './resources/suppliers.js';
import { TrendyolTransport, type TrendyolEnvironment } from './transport.js';

export interface CreateClientOptions {
  /** Trendyol seller (supplier) ID — visible in Partner Panel → Account Info. */
  sellerId: number;
  /** Trendyol API key. */
  apiKey: string;
  /** Trendyol API secret. */
  apiSecret: string;
  /** Which Trendyol environment to target. */
  env: TrendyolEnvironment;
  /**
   * Integrator company name to send in `User-Agent` / `x-agentname`.
   * Defaults to `'SelfIntegration'` if the seller owns the integration code.
   * Trendyol caps this at 30 alphanumeric characters.
   */
  integratorName?: string;
  /**
   * IPv4 address to send in `x-clientip`.
   * Defaults to `'127.0.0.1'` — Trendyol does not validate this against the
   * request origin, the header just has to be present and IPv4-shaped.
   */
  clientIp?: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
}

export interface TrendyolClient {
  brands: BrandsResource;
  categories: CategoriesResource;
  suppliers: SuppliersResource;
  products: ProductsResource;
}

/**
 * Create a Trendyol Marketplace SDK client.
 *
 * @example
 * ```ts
 * import { createTrendyolClient } from '@lonca/trendyol';
 *
 * const client = createTrendyolClient({
 *   sellerId: 12345,
 *   apiKey: process.env.TRENDYOL_API_KEY!,
 *   apiSecret: process.env.TRENDYOL_API_SECRET!,
 *   env: 'stage',
 * });
 *
 * const page = await client.brands.list({ limit: 100 });
 * ```
 */
export function createTrendyolClient(opts: CreateClientOptions): TrendyolClient {
  const transport = new TrendyolTransport({
    sellerId: opts.sellerId,
    apiKey: opts.apiKey,
    apiSecret: opts.apiSecret,
    env: opts.env,
    integratorName: opts.integratorName,
    clientIp: opts.clientIp,
    logger: opts.logger,
    timeoutMs: opts.timeoutMs,
  });

  return {
    brands: new BrandsResource(transport),
    categories: new CategoriesResource(transport),
    suppliers: new SuppliersResource(transport, opts.sellerId),
    products: new ProductsResource(transport, opts.sellerId),
  };
}
