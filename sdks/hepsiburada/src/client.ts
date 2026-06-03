import type { Logger } from '@lonca/core';
import { AccountingResource } from './resources/accounting.js';
import { CatalogResource } from './resources/catalog.js';
import { CategoriesResource } from './resources/categories.js';
import { ClaimsResource } from './resources/claims.js';
import { ListingsResource } from './resources/listings.js';
import { OrdersResource } from './resources/orders.js';
import { ProductUpdatesResource } from './resources/product-updates.js';
import { PromotionsResource } from './resources/promotions.js';
import { QuestionsResource } from './resources/questions.js';
import { ShippingResource } from './resources/shipping.js';
import { SuppliersResource } from './resources/suppliers.js';
import { TestOrdersResource } from './resources/test-orders.js';
import { hepsiburadaCapabilities, type HepsiburadaCapabilities } from './capabilities.js';
import { HepsiburadaTransport, type HepsiburadaEnvironment } from './transport.js';

export interface CreateClientOptions {
  /** Hepsiburada merchant ID (UUID-shaped). Visible in the Merchant Portal. */
  merchantId: string;
  /** Hepsiburada API username (from Merchant Portal → Settings → Integrations). */
  username: string;
  /** Hepsiburada API password / secret. */
  password: string;
  /**
   * Which Hepsiburada environment to target — `'prod'` (production) or
   * `'sit'` (sandbox). No default — explicit is safer than implicit.
   */
  env: HepsiburadaEnvironment;
  /**
   * Integrator company name sent in `User-Agent`. Hepsiburada rejects requests
   * without a meaningful User-Agent. Use the bare integrator name configured
   * server-side in the Merchant Portal (e.g. `beekod_dev`).
   */
  integratorName: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
}

export interface HepsiburadaClient {
  listings: ListingsResource;
  shipping: ShippingResource;
  claims: ClaimsResource;
  testOrders: TestOrdersResource;
  orders: OrdersResource;
  categories: CategoriesResource;
  catalog: CatalogResource;
  productUpdates: ProductUpdatesResource;
  suppliers: SuppliersResource;
  accounting: AccountingResource;
  questions: QuestionsResource;
  promotions: PromotionsResource;
  /** Static feature-capability flags for feature detection. */
  capabilities: HepsiburadaCapabilities;
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

  return buildClient(transport);
}

/**
 * Wire the full resource graph over a transport. Shared by
 * {@link createHepsiburadaClient} and the `@lonca/hepsiburada/testing` fake
 * client so both stay structurally identical. Not re-exported from the entry.
 *
 * @internal
 */
export function buildClient(transport: HepsiburadaTransport): HepsiburadaClient {
  return {
    listings: new ListingsResource(transport),
    shipping: new ShippingResource(transport),
    claims: new ClaimsResource(transport),
    testOrders: new TestOrdersResource(transport),
    orders: new OrdersResource(transport),
    categories: new CategoriesResource(transport),
    catalog: new CatalogResource(transport),
    productUpdates: new ProductUpdatesResource(transport),
    suppliers: new SuppliersResource(transport),
    accounting: new AccountingResource(transport),
    questions: new QuestionsResource(transport),
    promotions: new PromotionsResource(transport),
    capabilities: hepsiburadaCapabilities,
  };
}
