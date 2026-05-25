/**
 * Raw-fetch the Trendyol shipment-packages endpoint and dump the real wire shape
 * so we can design the Orders resource against verified data (not the spec alone).
 *
 * Run:
 *   pnpm try:inspect-orders
 *
 * Uses the same env vars as try:trendyol (TY_SELLER_ID, TY_API_KEY, TY_API_SECRET, TY_ENV).
 */
import { randomUUID } from 'node:crypto';

const sellerId = Number(process.env.TY_SELLER_ID);
const apiKey = process.env.TY_API_KEY;
const apiSecret = process.env.TY_API_SECRET;
const env = (process.env.TY_ENV ?? 'stage') as 'prod' | 'stage';

if (!Number.isFinite(sellerId) || !apiKey || !apiSecret) {
  console.error('✖ Set TY_SELLER_ID / TY_API_KEY / TY_API_SECRET');
  process.exit(1);
}

const base = env === 'prod' ? 'https://apigw.trendyol.com' : 'https://stageapigw.trendyol.com';

const auth = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
const correlationId = randomUUID();

const headers: Record<string, string> = {
  Authorization: `Basic ${auth}`,
  'x-clientip': '127.0.0.1',
  'x-correlationid': correlationId,
  'x-agentname': 'LoncaInspect',
  'User-Agent': `${sellerId} - LoncaInspect`,
  Accept: 'application/json',
};

const url = `${base}/integration/order/sellers/${sellerId}/orders?size=2`;
console.log(`GET ${url}`);
console.log(`(correlationId: ${correlationId})\n`);

const res = await fetch(url, { headers });
console.log('status:', res.status, res.statusText);
console.log('content-type:', res.headers.get('content-type'));
console.log();

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

  const content = (data.content ?? data.shipmentPackages) as unknown[] | undefined;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>;
    console.log('\nfirst package top-level keys:', Object.keys(first).join(', '));

    // Dump scalar fields inline.
    const scalars = Object.entries(first)
      .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
      .join('\n');
    console.log('\nscalar fields:');
    console.log(scalars);

    // Drill into nested arrays/objects we already know matter.
    for (const key of ['lines', 'packageHistory', 'invoiceAddress', 'shipmentAddress']) {
      const value = (first as Record<string, unknown>)[key];
      if (value !== undefined) {
        const preview = JSON.stringify(value).slice(0, 600);
        console.log(`\n${key}:`, preview);
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          console.log(
            `  ${key}[0] keys:`,
            Object.keys(value[0] as Record<string, unknown>).join(', '),
          );
        }
      }
    }
  } else {
    console.log('\nNo packages found. Body sample:', text.slice(0, 800));
  }
} catch (e) {
  console.log('Non-JSON body:', text.slice(0, 1000));
  console.error('parse error:', (e as Error).message);
}
