/**
 * Raw-fetch the 3 product read endpoints (Group 2) so we can verify the wire
 * shape before designing types:
 *   - GET filterUnapprovedProducts
 *   - POST getBuyboxInformation
 *   - GET getProductBase
 *
 * Run:
 *   pnpm try:inspect-product-reads
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
const baseHeaders: Record<string, string> = {
  Authorization: `Basic ${auth}`,
  'x-clientip': '127.0.0.1',
  'x-agentname': 'LoncaInspect',
  'User-Agent': `${sellerId} - LoncaInspect`,
  Accept: 'application/json',
};

console.log(`Env: ${env.toUpperCase()}  seller: ${sellerId}\n`);

async function rawGet(path: string): Promise<unknown> {
  const url = `${base}${path}`;
  console.log(`GET ${url}`);
  const res = await fetch(url, {
    headers: { ...baseHeaders, 'x-correlationid': randomUUID() },
  });
  console.log(`  status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.log('  non-JSON:', text.slice(0, 400));
    return null;
  }
}

async function rawPost(path: string, body: unknown): Promise<unknown> {
  const url = `${base}${path}`;
  console.log(`POST ${url}  body: ${JSON.stringify(body)}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'x-correlationid': randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  console.log(`  status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.log('  non-JSON:', text.slice(0, 400));
    return null;
  }
}

function dumpScalars(label: string, obj: Record<string, unknown>) {
  console.log(`\n${label} scalar fields:`);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  const nested = Object.entries(obj).filter(([, v]) => v && typeof v === 'object');
  if (nested.length) {
    console.log(`${label} nested keys: ${nested.map(([k]) => k).join(', ')}`);
  }
}

// ── 1. filterUnapprovedProducts ──────────────────────────────────────────
console.log('── 1. filterUnapprovedProducts ──────────────────────────');
const unapprovedRes = (await rawGet(
  `/integration/product/sellers/${sellerId}/products/unapproved?page=0&size=2`,
)) as Record<string, unknown> | null;
if (unapprovedRes) {
  console.log('top-level keys:', Object.keys(unapprovedRes).join(', '));
  console.log(
    'pagination:',
    JSON.stringify({
      page: unapprovedRes.page,
      size: unapprovedRes.size,
      totalPages: unapprovedRes.totalPages,
      totalElements: unapprovedRes.totalElements,
      nextPageToken: unapprovedRes.nextPageToken ? '<present>' : '(none)',
    }),
  );
  const content = unapprovedRes.content as unknown[] | undefined;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown>;
    console.log(`content[].length: ${content.length}`);
    console.log('content[0] top-level keys:', Object.keys(first).join(', '));
    dumpScalars('content[0]', first);
    for (const k of ['brand', 'category', 'media', 'attributes', 'rejectReasonDetails']) {
      const v = first[k];
      if (v !== undefined) {
        const preview = JSON.stringify(v).slice(0, 400);
        console.log(`content[0].${k}: ${preview}`);
      }
    }
  } else {
    console.log('No unapproved products to inspect.');
  }
}

// ── 2. getProductBase ────────────────────────────────────────────────────
console.log('\n── 2. getProductBase (need a real barcode) ──────────────');
// Pull one barcode from approved products to test against.
const client = createTrendyolClient({
  sellerId,
  apiKey,
  apiSecret,
  env,
  integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaInspect',
});
const probe = await client.products.list({ limit: 1 });
const probeBarcode = probe.items[0]?.variants[0]?.barcode;
if (!probeBarcode) {
  console.log('No approved product found to probe with — skipping getProductBase');
} else {
  console.log(`Using barcode from approved list: ${probeBarcode}`);
  const baseRes = (await rawGet(
    `/integration/product/sellers/${sellerId}/product/${encodeURIComponent(probeBarcode)}`,
  )) as Record<string, unknown> | null;
  if (baseRes) {
    console.log('top-level keys:', Object.keys(baseRes).join(', '));
    dumpScalars('product-base', baseRes);
  }
}

// ── 3. getBuyboxInformation ──────────────────────────────────────────────
console.log('\n── 3. getBuyboxInformation (POST) ───────────────────────');
if (!probeBarcode) {
  console.log('No barcode — skipping buybox');
} else {
  const buyboxRes = (await rawPost(
    `/integration/product/sellers/${sellerId}/products/buybox-information`,
    { barcodes: [probeBarcode] },
  )) as Record<string, unknown> | null;
  if (buyboxRes) {
    console.log('top-level keys:', Object.keys(buyboxRes).join(', '));
    const info = (buyboxRes.buyboxInfo ?? buyboxRes.content) as unknown[] | undefined;
    if (Array.isArray(info) && info.length > 0) {
      const first = info[0] as Record<string, unknown>;
      console.log(`buyboxInfo[].length: ${info.length}`);
      console.log('buyboxInfo[0] keys:', Object.keys(first).join(', '));
      dumpScalars('buyboxInfo[0]', first);
    } else {
      console.log('Empty buyboxInfo. Full response:', JSON.stringify(buyboxRes).slice(0, 400));
    }
  }
}

console.log('\nDone.');
