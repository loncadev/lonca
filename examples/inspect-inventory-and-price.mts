/**
 * Verify the wire shape of the new lightweight stock+price filter:
 *   GET /integration/product/sellers/{sellerId}/products/approved/inventory-and-price
 *
 * Confirms: response keys, variant keys, whether `stockLastModifiedDate` is
 * null vs absent, and whether `storeFrontCode` header is required on STAGE.
 *
 * Run:
 *   pnpm tsx --env-file=.env examples/inspect-inventory-and-price.mts
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

const base = env === 'prod' ? 'https://apigw.trendyol.com' : 'https://stageapigw.trendyol.com';
const auth = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
const path = `/integration/product/sellers/${sellerId}/products/approved/inventory-and-price?size=5&page=0`;

console.log(`Env: ${env.toUpperCase()}  seller: ${sellerId}\n`);

// ── 1. Raw GET WITHOUT storeFrontCode (is the header required on STAGE?) ──────
async function rawGet(label: string, headers: Record<string, string>): Promise<unknown> {
  console.log(`${label}\nGET ${base}${path}`);
  const res = await fetch(`${base}${path}`, {
    headers: { ...headers, 'x-correlationid': randomUUID() },
  });
  console.log(`  status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.log('  non-JSON:', text.slice(0, 300));
    return null;
  }
}

const baseHeaders: Record<string, string> = {
  Authorization: `Basic ${auth}`,
  'x-clientip': '127.0.0.1',
  'x-agentname': 'LoncaInspect',
  'User-Agent': `${sellerId} - LoncaInspect`,
  Accept: 'application/json',
};

function describe(data: unknown): void {
  if (!data || typeof data !== 'object') {
    console.log('  (no object body)\n');
    return;
  }
  const obj = data as Record<string, unknown>;
  console.log('  response keys:', Object.keys(obj).join(', '));
  const content = obj.content as Array<Record<string, unknown>> | undefined;
  console.log(
    '  content length:',
    content?.length ?? 0,
    ' nextPageToken:',
    obj.nextPageToken ?? '(none)',
  );
  const first = content?.[0];
  if (first) {
    console.log('  content[0] keys:', Object.keys(first).join(', '));
    const variants = first.variants as Array<Record<string, unknown>> | undefined;
    const v = variants?.[0];
    if (v) {
      console.log('  variant[0] keys:', Object.keys(v).join(', '));
      console.log(
        '  variant[0].stockLastModifiedDate =',
        'stockLastModifiedDate' in v ? JSON.stringify(v.stockLastModifiedDate) : '(ABSENT)',
      );
    }
  }
  console.log();
}

const withoutSF = await rawGet('── Raw GET (NO storeFrontCode header) ──', baseHeaders);
describe(withoutSF);

const withSF = await rawGet('── Raw GET (WITH storeFrontCode: TR) ──', {
  ...baseHeaders,
  storeFrontCode: 'TR',
});
describe(withSF);

// ── 2. Through the SDK (normalized) ──────────────────────────────────────────
console.log('── SDK: client.products.listInventoryAndPrice({ limit: 5 }) ──');
const client = createTrendyolClient({
  sellerId,
  apiKey,
  apiSecret,
  env,
  integratorName: 'LoncaInspect',
});
const page = await client.products.listInventoryAndPrice({ limit: 5 });
console.log('  items:', page.items.length, ' nextCursor:', page.nextCursor ?? '(none)');
console.log(
  '  first normalized item:',
  JSON.stringify(page.items[0] ? { ...page.items[0], raw: '…' } : null, null, 2),
);
