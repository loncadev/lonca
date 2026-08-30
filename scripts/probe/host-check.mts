#!/usr/bin/env -S pnpm exec tsx
/**
 * Hepsiburada host-discrepancy probe (roadmap 2.1a).
 *
 * The SDK routes `accounting`, `suppliers`, `questions`, `promotions` and
 * `productUpdates` through the `oms` service host, while the developer portal's
 * OpenAPI documents (`specs/hepsiburada/*.json`, `servers[0]`) put the same
 * paths on dedicated hosts. This script calls each resource's read method
 * through the SDK *as-is*, then raw-fetches the same path against both the
 * SDK host and the spec host with the exact header set the SDK sends, and
 * prints status codes only. No response body is ever read.
 *
 *   pnpm exec tsx --env-file=.env scripts/probe/host-check.mts
 *
 * Read-only: every request is a GET. Bogus identifiers are used where a path
 * needs one, so a 404 / 400 on the *right* host is the expected outcome; the
 * point is telling "route exists" apart from "host does not know this path".
 */
import { randomUUID } from 'node:crypto';
import { isLoncaError } from '@lonca/core';
import { createHepsiburadaClient, type HepsiburadaClient } from '@lonca/hepsiburada';

for (const name of ['HB_MERCHANT_ID', 'HB_API_USER', 'HB_API_PASS']) {
  if (!process.env[name]) {
    console.error(`✖ Missing required env var: ${name}`);
    process.exit(2);
  }
}

const merchantId = process.env.HB_MERCHANT_ID!;
const env = process.env.HB_ENV ?? 'sit';
if (env !== 'sit') {
  console.error(`✖ host-check is SIT-only (HB_ENV=${env}); refusing to run against production.`);
  process.exit(2);
}
const integratorName = process.env.HB_INTEGRATOR_NAME ?? 'LoncaProbe';

const client = createHepsiburadaClient({
  merchantId,
  username: process.env.HB_API_USER!,
  password: process.env.HB_API_PASS!,
  env: 'sit',
  integratorName,
});

// Same header set as sdks/hepsiburada/src/transport.ts#buildHeaders.
const authHeader =
  'Basic ' +
  Buffer.from(`${process.env.HB_API_USER}:${process.env.HB_API_PASS}`, 'utf8').toString('base64');
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-correlationid': randomUUID(),
    'User-Agent': integratorName,
    ...extra,
  };
}

const SDK_HOST = 'https://oms-external-sit.hepsiburada.com';
const m = encodeURIComponent(merchantId);
const bogusId = randomUUID();

interface Case {
  resource: string;
  sdkMethod: string;
  viaSdk: (c: HepsiburadaClient) => Promise<unknown>;
  /** Path the SDK builds (host: SDK_HOST). */
  sdkPath: string;
  /** Host + path as published in specs/hepsiburada/<file>.json. */
  specHost: string;
  specPath: string;
  specFile: string;
  /** Extra headers the spec marks as required (never sent by the SDK today). */
  specHeaders?: Record<string, string>;
}

const cases: Case[] = [
  {
    resource: 'accounting',
    sdkMethod: 'accounting.listTransactions({ offset: 0, limit: 1 })',
    viaSdk: (c) => c.accounting.listTransactions({ offset: 0, limit: 1 }),
    sdkPath: `/transactions/merchantId/${m}?offset=0&limit=1`,
    specHost: 'https://mpfinance-external-sit.hepsiburada.com',
    specPath: `/transactions/merchantid/${m}?Offset=0&Limit=1`,
    specFile: 'mpfinance-external.json',
  },
  {
    resource: 'suppliers',
    sdkMethod: 'suppliers.getListingUpdateRequest(<uuid>)',
    viaSdk: (c) => c.suppliers.getListingUpdateRequest(bogusId),
    sdkPath: `/suppliers/${m}/listingUpdateRequests/${bogusId}`,
    specHost: 'https://supplier-api-external-sit.hepsiburada.com',
    specPath: `/suppliers/${m}/listingUpdateRequests/${bogusId}`,
    specFile: 'supplier-api-external.json',
  },
  {
    resource: 'questions',
    sdkMethod: 'questions.list({ offset: 0, limit: 1 })',
    viaSdk: (c) => c.questions.list({ offset: 0, limit: 1 }),
    sdkPath: '/api/v1.0/issues?offset=0&limit=1',
    specHost: 'https://api-asktoseller-merchant-sit.hepsiburada.com',
    specPath: '/api/v1.0/issues?page=0&size=1',
    specFile: 'asktoseller-merchant.json',
    specHeaders: { merchantId },
  },
  {
    resource: 'promotions',
    sdkMethod: 'promotions.listCategories()',
    viaSdk: (c) => c.promotions.listCategories(),
    sdkPath: `/categories/${m}`,
    specHost: 'https://diskonto-external-sit.hepsiburada.com',
    specPath: `/categories/${m}`,
    specFile: 'diskonto-external.json',
  },
  {
    resource: 'promotions',
    sdkMethod: 'promotions.listDiscounts()',
    viaSdk: (c) => c.promotions.listDiscounts(),
    sdkPath: `/self-campaign/${m}/discounts`,
    specHost: 'https://diskonto-external-sit.hepsiburada.com',
    specPath: `/self-campaign/${m}/discounts?page=0&pagesize=1`,
    specFile: 'diskonto-external.json',
  },
  {
    resource: 'productUpdates',
    sdkMethod: 'productUpdates.getUpdateStatus(<uuid>)',
    viaSdk: (c) => c.productUpdates.getUpdateStatus(bogusId),
    sdkPath: `/api/integrator/status/${bogusId}`,
    specHost: 'https://mpop-sit.hepsiburada.com/ticket-api',
    specPath: `/api/integrator/status/${bogusId}`,
    specFile: 'mpop-product-updates.json',
  },
];

async function rawStatus(
  host: string,
  path: string,
  extra?: Record<string, string>,
): Promise<string> {
  try {
    const res = await fetch(host + path, {
      method: 'GET',
      headers: headers(extra),
      redirect: 'manual',
    });
    // Drain without keeping the body: content-type is the only thing recorded.
    await res.arrayBuffer();
    const ct = (res.headers.get('content-type') ?? '').split(';')[0] || 'no content-type';
    return `${res.status} (${ct})`;
  } catch (err) {
    return `network error: ${err instanceof Error ? err.name : 'unknown'}`;
  }
}

async function sdkStatus(c: Case): Promise<string> {
  try {
    await c.viaSdk(client);
    return 'ok (2xx)';
  } catch (err) {
    if (isLoncaError(err)) return `${err.code}${err.status ? ` ${err.status}` : ''}`;
    return `threw ${err instanceof Error ? err.name : 'unknown'}`;
  }
}

console.log(`Hepsiburada host check — SIT, merchant ${merchantId.slice(0, 8)}…\n`);
const rows: string[][] = [];
for (const c of cases) {
  const viaSdk = await sdkStatus(c);
  const sdkHost = await rawStatus(SDK_HOST, c.sdkPath);
  const specHost = await rawStatus(c.specHost, c.specPath, c.specHeaders);
  rows.push([
    c.resource,
    `\`${c.sdkMethod}\``,
    viaSdk,
    `\`${new URL(SDK_HOST).host}\` ${sdkHost}`,
    `\`${c.specHost.replace('https://', '')}\` ${specHost}`,
    c.specFile,
  ]);
}

const header = [
  'Resource',
  'SDK call',
  'SDK result',
  'Raw GET on SDK host',
  'Raw GET on spec host',
  'Spec file',
];
console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
console.log('\nStatus codes only; no response body was read or printed.');
