/**
 * Hepsiburada read-only probes. Every call here is a GET behind the SDK; the
 * set never touches upload / create / update / delete methods.
 */
import {
  createHepsiburadaClient,
  type HepsiburadaClient,
  type HepsiburadaEnvironment,
} from '@lonca/hepsiburada';
import type { ProbeSet } from '../registry.mts';

const PAGE = { offset: 0, limit: 10 } as const;

function env(): HepsiburadaEnvironment {
  return (process.env.HB_ENV ?? 'sit') as HepsiburadaEnvironment;
}

export const hepsiburadaProbes: ProbeSet<HepsiburadaClient> = {
  marketplace: 'hepsiburada',
  requiredEnv: ['HB_MERCHANT_ID', 'HB_API_USER', 'HB_API_PASS'],
  envLabel: env,
  createClient: () =>
    createHepsiburadaClient({
      merchantId: process.env.HB_MERCHANT_ID!,
      username: process.env.HB_API_USER!,
      password: process.env.HB_API_PASS!,
      env: env(),
      integratorName: process.env.HB_INTEGRATOR_NAME ?? 'LoncaProbe',
    }),
  probes: [
    { name: 'listings.list', call: (c) => c.listings.list(PAGE) },
    { name: 'catalog.listProducts', call: (c) => c.catalog.listProducts({ page: 0, size: 10 }) },
    {
      name: 'catalog.listProductsByStatus(MATCHED)',
      call: (c) => c.catalog.listProductsByStatus({ status: 'MATCHED', page: 0, size: 10 }),
    },
    { name: 'orders.list', call: (c) => c.orders.list(PAGE) },
    { name: 'categories.list', call: (c) => c.categories.list({ page: 0, size: 10, leaf: true }) },
    {
      name: 'categories.getAttributes',
      call: async (c) => {
        // Pick the first leaf category the account can see; only the
        // attributes response is summarised.
        const page = await c.categories.list({ page: 0, size: 1, leaf: true });
        const first = page.data[0];
        if (!first) throw new Error('categories.list returned no category to inspect');
        return c.categories.getAttributes(first.categoryId);
      },
    },
    { name: 'claims.list', call: (c) => c.claims.list(PAGE) },
    { name: 'questions.list', call: (c) => c.questions.list(PAGE) },
    { name: 'shipping.getCargoFirms', call: (c) => c.shipping.getCargoFirms() },
    { name: 'shipping.listProfiles', call: (c) => c.shipping.listProfiles() },
    { name: 'accounting.listTransactions', call: (c) => c.accounting.listTransactions(PAGE) },
  ],
};
