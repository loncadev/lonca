import type { Logger } from '@lonca/core';
import { ListingsResource } from './resources/listings.js';
import { HepsiburadaTransport, type HepsiburadaEnvironment } from './transport.js';

export interface CreateClientOptions {
  /** Hepsiburada merchant ID (UUID-shaped). Visible in the Merchant Portal. */
  merchantId: string;
  /** Hepsiburada API username (from Merchant Portal → Settings → Integrations). */
  username: string;
  /** Hepsiburada API password / secret. */
  password: string;
  /** Which Hepsiburada environment to target — `'prod'` or `'sit'` (sandbox). */
  env: HepsiburadaEnvironment;
  /**
   * Integrator company name to send in `User-Agent`. Required: Hepsiburada
   * rejects requests without a meaningful User-Agent string.
   */
  integratorName: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
}

export interface HepsiburadaClient {
  listings: ListingsResource;
}

/**
 * Create a Hepsiburada Marketplace SDK client.
 *
 * @example
 * ```ts
 * import { createHepsiburadaClient } from '@lonca/hepsiburada';
 *
 * const client = createHepsiburadaClient({
 *   merchantId: '00000000-0000-0000-0000-000000000000',
 *   username: process.env.HB_API_USER!,
 *   password: process.env.HB_API_PASS!,
 *   env: 'sit',
 *   integratorName: 'MyCompany',
 * });
 *
 * const page = await client.listings.list({ offset: 0, limit: 100 });
 * for (const listing of page.listings) {
 *   console.log(listing.hepsiburadaSku, listing.availableStock, listing.price);
 * }
 * ```
 */
export function createHepsiburadaClient(opts: CreateClientOptions): HepsiburadaClient {
  const transport = new HepsiburadaTransport({
    merchantId: opts.merchantId,
    username: opts.username,
    password: opts.password,
    env: opts.env,
    integratorName: opts.integratorName,
    logger: opts.logger,
    timeoutMs: opts.timeoutMs,
  });

  return {
    listings: new ListingsResource(transport),
  };
}
