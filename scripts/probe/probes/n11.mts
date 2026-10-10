/**
 * n11 read-only probes. Every call here is a GET behind the SDK; the set never
 * touches the product task (create / update / price-stock / delete) or order
 * update services. n11 documents no sandbox, so these run against prod.
 */
import { createN11Client, type N11Client, type N11Environment } from '@lonca/n11';
import type { ProbeSet } from '../registry.mts';

function env(): N11Environment {
  return (process.env.N11_ENV ?? 'prod') as N11Environment;
}

/** Depth-first search for the first leaf of the category tree. */
function firstLeaf(
  nodes: Awaited<ReturnType<N11Client['categories']['list']>>,
): string | undefined {
  for (const node of nodes) {
    if (node.leaf) return node.id;
    const leaf = firstLeaf(node.subCategories);
    if (leaf) return leaf;
  }
  return undefined;
}

export const n11Probes: ProbeSet<N11Client> = {
  marketplace: 'n11',
  requiredEnv: ['N11_APP_KEY', 'N11_APP_SECRET'],
  envLabel: env,
  createClient: (fetch) =>
    createN11Client({
      appKey: process.env.N11_APP_KEY!,
      appSecret: process.env.N11_APP_SECRET!,
      env: env(),
      integratorName: process.env.N11_INTEGRATOR_NAME ?? 'LoncaProbe',
      fetch,
    }),
  probes: [
    { name: 'categories.list', call: (c) => c.categories.list() },
    {
      name: 'categories.getAttributes',
      call: async (c) => {
        // Prefer the category of a listed product (its attributes carry values);
        // fall back to the first leaf of the tree for an account with no products.
        const page = await c.products.list({ limit: 1 });
        const categoryId = page.items[0]?.categoryId || firstLeaf(await c.categories.list());
        if (!categoryId) throw new Error('no leaf category to inspect');
        return c.categories.getAttributes(categoryId);
      },
    },
    { name: 'products.list', call: (c) => c.products.list({ limit: 10 }) },
    { name: 'orders.list', call: (c) => c.orders.list({ limit: 10 }) },
  ],
};
