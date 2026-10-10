/**
 * Trendyol read-only probes. Every call here is a GET behind the SDK; the set
 * never touches create / update / delete methods.
 */
import {
  createTrendyolClient,
  type Category,
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
  createClient: (fetch) =>
    createTrendyolClient({
      sellerId: Number(process.env.TY_SELLER_ID),
      apiKey: process.env.TY_API_KEY!,
      apiSecret: process.env.TY_API_SECRET!,
      env: env(),
      integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaProbe',
      fetch,
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
    // Verification targets for SDK fields the type-vs-spec check could not
    // confirm from the probes above (roadmap Faz 1b). All GET.
    {
      name: 'locations.getTurkeyDistricts',
      call: async (c) => {
        const [city] = await c.locations.getTurkeyCities();
        if (!city?.id) throw new Error('getTurkeyCities returned no city to inspect');
        return c.locations.getTurkeyDistricts(city.id);
      },
    },
    {
      name: 'locations.getTurkeyNeighborhoods',
      call: async (c) => {
        const [city] = await c.locations.getTurkeyCities();
        if (!city?.id) throw new Error('getTurkeyCities returned no city to inspect');
        const [district] = await c.locations.getTurkeyDistricts(city.id);
        if (!district?.id) throw new Error('getTurkeyDistricts returned no district to inspect');
        return c.locations.getTurkeyNeighborhoods(city.id, district.id);
      },
    },
    {
      name: 'categories.getAttributes',
      call: async (c) => {
        const leaf = firstLeaf(await c.categories.list());
        if (!leaf) throw new Error('categories.list returned no leaf category to inspect');
        return c.categories.getAttributes(leaf.id);
      },
    },
    { name: 'products.listUnapproved', call: (c) => c.products.listUnapproved(PAGE) },
    {
      name: 'categories.getAttributeValues',
      call: async (c) => {
        const leaf = firstLeaf(await c.categories.list());
        if (!leaf) throw new Error('categories.list returned no leaf category to inspect');
        const attrs = await c.categories.getAttributes(leaf.id);
        const attr = attrs.find((a) => !a.allowCustom) ?? attrs[0];
        if (!attr) throw new Error('getAttributes returned no attribute to inspect');
        return c.categories.getAttributeValues(leaf.id, attr.id, PAGE);
      },
    },
    {
      name: 'orders.listStream(7d)',
      call: (c) => {
        const lastModifiedEndDate = new Date();
        const lastModifiedStartDate = new Date(lastModifiedEndDate.getTime() - WEEK_MS);
        return c.orders.listStream({ ...PAGE, lastModifiedStartDate, lastModifiedEndDate });
      },
    },
    {
      name: 'orders.list(Delivered)',
      call: (c) => c.orders.list({ ...PAGE, status: 'Delivered' }),
    },
    // Trendyol caps this endpoint at one request per hour per seller.
    { name: 'suppliers.getAddresses', call: (c) => c.suppliers.getAddresses() },
  ],
};

/** Depth-first first category without children. */
function firstLeaf(categories: readonly Category[]): Category | undefined {
  for (const category of categories) {
    if (category.subCategories.length === 0) return category;
    const leaf = firstLeaf(category.subCategories);
    if (leaf) return leaf;
  }
  return undefined;
}
