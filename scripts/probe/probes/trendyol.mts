/**
 * Trendyol read-only probes. Every call here is a GET behind the SDK; the set
 * never touches create / update / delete methods.
 */
import {
  createTrendyolClient,
  type TrendyolClient,
  type TrendyolEnvironment,
} from '@lonca/trendyol';
import type { ProbeSet } from '../registry.mts';

const PAGE = { limit: 10 } as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function env(): TrendyolEnvironment {
  return (process.env.TY_ENV ?? 'stage') as TrendyolEnvironment;
}

export const trendyolProbes: ProbeSet<TrendyolClient> = {
  marketplace: 'trendyol',
  requiredEnv: ['TY_SELLER_ID', 'TY_API_KEY', 'TY_API_SECRET'],
  envLabel: env,
  createClient: () =>
    createTrendyolClient({
      sellerId: Number(process.env.TY_SELLER_ID),
      apiKey: process.env.TY_API_KEY!,
      apiSecret: process.env.TY_API_SECRET!,
      env: env(),
      integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaProbe',
    }),
  probes: [
    { name: 'products.list', call: (c) => c.products.list(PAGE) },
    { name: 'orders.list', call: (c) => c.orders.list(PAGE) },
    { name: 'categories.list', call: (c) => c.categories.list() },
    { name: 'brands.list', call: (c) => c.brands.list(PAGE) },
    { name: 'locations.getTurkeyCities', call: (c) => c.locations.getTurkeyCities() },
    { name: 'questions.list', call: (c) => c.questions.list(PAGE) },
    { name: 'claims.list', call: (c) => c.claims.list(PAGE) },
    {
      name: 'finance.getSettlements(Sale,7d)',
      call: (c) => {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - WEEK_MS);
        return c.finance.getSettlements({ transactionType: 'Sale', startDate, endDate, ...PAGE });
      },
    },
    { name: 'webhooks.list', call: (c) => c.webhooks.list() },
  ],
};
