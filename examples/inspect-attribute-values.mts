/**
 * Raw-fetch the V2 getCategoryAttributeValues endpoint so we can verify the
 * wire shape before designing types.
 *
 * Auto-discovers a viable (categoryId, attributeId) pair by walking the live
 * category tree, finding a leaf with attributes, and picking the first
 * attribute whose `attributeValues` is non-empty (or, failing that, the
 * first attribute at all — we then hit the dedicated endpoint to confirm
 * the value catalog is served separately, not inlined).
 *
 * Run:
 *   pnpm try:inspect-attribute-values
 *
 * Uses the same env vars as try:trendyol.
 */
import { randomUUID } from 'node:crypto';
import { createTrendyolClient, type TrendyolEnvironment } from '@lonca/trendyol';

const sellerId = Number(process.env.TY_SELLER_ID);
const apiKey = process.env.TY_API_KEY!;
const apiSecret = process.env.TY_API_SECRET!;
const env = (process.env.TY_ENV ?? 'stage') as TrendyolEnvironment;

if (!Number.isFinite(sellerId) || !apiKey || !apiSecret) {
  console.error('✖ Set TY_SELLER_ID / TY_API_KEY / TY_API_SECRET');
  process.exit(1);
}

const client = createTrendyolClient({
  sellerId,
  apiKey,
  apiSecret,
  env,
  integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaInspect',
});

console.log(`Env: ${env.toUpperCase()}  seller: ${sellerId}\n`);

// 1. Walk the category tree to find a leaf.
console.log('Walking category tree …');
const tree = await client.categories.list();

interface TreeNode {
  id: string;
  name: string;
  subCategories: TreeNode[];
}
function collectLeaves(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.subCategories.length === 0) out.push(n);
    else out.push(...collectLeaves(n.subCategories));
  }
  return out;
}
const leaves = collectLeaves(tree as TreeNode[]);
console.log(`  total leaves: ${leaves.length}`);

// Walk leaves until we find one with attributes whose value catalog is
// populated. STAGE has many empty test cats AND free-text-only attributes;
// we want to surface BOTH the empty shape and the populated shape.
let leaf: TreeNode | null = null;
type AttrItem = Awaited<ReturnType<typeof client.categories.getAttributes>>[number];
let picked: AttrItem | null = null;
const maxProbe = Math.min(leaves.length, 200);

const base = env === 'prod' ? 'https://apigw.trendyol.com' : 'https://stageapigw.trendyol.com';
const auth = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
const baseHeaders = {
  Authorization: `Basic ${auth}`,
  'x-clientip': '127.0.0.1',
  'x-agentname': 'LoncaInspect',
  'User-Agent': `${sellerId} - LoncaInspect`,
  Accept: 'application/json',
};

probe: for (let i = 0; i < maxProbe; i++) {
  const candidate = leaves[i]!;
  const list = await client.categories.getAttributes(candidate.id);
  if (list.length === 0) continue;
  // Try each attribute under this leaf for a non-empty value catalog.
  for (const attr of list) {
    const probeUrl = `${base}/integration/product/categories/${candidate.id}/attributes/${attr.id}/values?page=0&size=1`;
    const probeRes = await fetch(probeUrl, {
      headers: { ...baseHeaders, 'x-correlationid': randomUUID() },
    });
    if (!probeRes.ok) continue;
    const probeData = (await probeRes.json()) as { totalElements?: number };
    if ((probeData.totalElements ?? 0) > 0) {
      leaf = candidate;
      picked = attr;
      console.log(
        `  probed ${i + 1} leaves — found populated attr after checking ${list.length} attrs under leaf`,
      );
      break probe;
    }
  }
}
if (!leaf || !picked) {
  console.error(`No populated attribute found in first ${maxProbe} leaves.`);
  process.exit(1);
}
console.log(`  picked leaf: ${leaf.id} (${leaf.name})`);
console.log(
  `  picked attribute: ${picked.id} (${picked.name})  inlineValues=${picked.values.length}\n`,
);

// 3. Raw-fetch the values endpoint.
const url = `${base}/integration/product/categories/${leaf.id}/attributes/${picked.id}/values?page=0&size=10`;

console.log(`GET ${url}`);
const res = await fetch(url, {
  headers: { ...baseHeaders, 'x-correlationid': randomUUID() },
});
console.log(`status: ${res.status} ${res.statusText}`);
console.log(`content-type: ${res.headers.get('content-type')}\n`);

const text = await res.text();
try {
  const data = JSON.parse(text) as Record<string, unknown>;
  console.log('top-level keys:', Object.keys(data).join(', '));
  console.log(
    'pagination:',
    JSON.stringify({
      page: data.page,
      size: data.size,
      totalPages: data.totalPages,
      totalElements: data.totalElements,
    }),
  );
  const content = data.content as unknown[] | undefined;
  if (Array.isArray(content) && content.length > 0) {
    console.log(`\ncontent[].length: ${content.length}`);
    console.log('content[0] keys:', Object.keys(content[0] as object).join(', '));
    console.log('content (first 5):');
    for (const item of content.slice(0, 5)) {
      console.log('  ', JSON.stringify(item));
    }
  } else {
    console.log('\nNo content. Body sample:', text.slice(0, 600));
  }
} catch (e) {
  console.log('Non-JSON body:', text.slice(0, 800));
  console.error('parse error:', (e as Error).message);
}
