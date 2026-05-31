/**
 * Smoke-test the @lonca/hepsiburada SDK against the live Hepsiburada API.
 *
 * Run:
 *   pnpm try:hepsiburada
 *
 * Required environment variables:
 *   HB_MERCHANT_ID     — UUID-shaped merchant id
 *   HB_API_USER        — Basic-auth username (Merchant Portal → Settings → Integrations)
 *   HB_API_PASS        — Basic-auth password
 *
 * Optional:
 *   HB_ENV             — 'prod' or 'sit' (default: 'sit'; sandbox is recommended for smoke)
 *   HB_INTEGRATOR_NAME — bare integrator name sent as User-Agent (default: 'LoncaSmokeTest')
 *
 * The script runs READ-ONLY against every resource. It never mutates state
 * (no POST / PUT / DELETE calls). Many endpoints will return `401` against
 * a sandbox merchant that lacks production scopes — this is expected and
 * reported as `🔒` rather than `✖`.
 */

import { createHepsiburadaClient, type HepsiburadaEnvironment } from '@lonca/hepsiburada';
import { LoncaError } from '@lonca/core';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✖ Missing required env var: ${name}`);
    console.error('  See examples/try-hepsiburada.mts for the full list.');
    process.exit(1);
  }
  return value;
}

const env = (process.env.HB_ENV ?? 'sit') as HepsiburadaEnvironment;
if (env !== 'prod' && env !== 'sit') {
  console.error(`✖ HB_ENV must be 'prod' or 'sit' (got: ${env})`);
  process.exit(1);
}

const client = createHepsiburadaClient({
  merchantId: required('HB_MERCHANT_ID'),
  username: required('HB_API_USER'),
  password: required('HB_API_PASS'),
  env,
  integratorName: process.env.HB_INTEGRATOR_NAME ?? 'LoncaSmokeTest',
});

console.log(
  `\n🚀 Hitting Hepsiburada ${env.toUpperCase()} as merchant ${required('HB_MERCHANT_ID')}\n`,
);

type Outcome =
  | { kind: 'ok'; summary: string }
  | { kind: 'restricted'; reason: string }
  | { kind: 'error'; reason: string };

function formatError(err: unknown): Outcome {
  if (err instanceof LoncaError) {
    if (err.status === 401 || err.status === 403) {
      return { kind: 'restricted', reason: `${err.code} (${err.status})` };
    }
    return { kind: 'error', reason: `${err.code} (${err.status ?? '?'}): ${err.message}` };
  }
  if (err instanceof Error) {
    return { kind: 'error', reason: `${err.name}: ${err.message}` };
  }
  return { kind: 'error', reason: String(err) };
}

async function section(title: string, fn: () => Promise<string>): Promise<void> {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(2, 60 - title.length))}`);
  try {
    const summary = await fn();
    console.log(`✓ ${summary}`);
  } catch (err) {
    const outcome = formatError(err);
    if (outcome.kind === 'restricted') {
      console.log(`🔒 restricted (sandbox merchant lacks scope) — ${outcome.reason}`);
    } else {
      console.log(`✖ ${outcome.reason}`);
    }
  }
}

// ─── Listings (Phase 1a, OpenAPI spec — `listing-external`) ─────────────

await section('1.1 listings.list({ offset: 0, limit: 2 })', async () => {
  const page = await client.listings.list({ offset: 0, limit: 2 });
  return `${page.listings.length}/${page.totalCount} listings on page; first: ${
    page.listings[0]?.hepsiburadaSku ?? '(empty)'
  }`;
});

await section('1.2 listings.getBuyboxOrder("HB-1") — expect 400 on fake SKU', async () => {
  const rows = await client.listings.getBuyboxOrder('HB-1');
  return `${rows.length} buybox row(s)`;
});

await section('1.3 listings.getCommissions("HB-1") — expect 400 on fake SKU', async () => {
  const rows = await client.listings.getCommissions('HB-1');
  return `${rows.length} commission row(s)`;
});

// ─── Shipping (Phase 1b, OpenAPI spec — `shipping-external`) ────────────

await section('2.1 shipping.getCargoFirms()', async () => {
  const firms = await client.shipping.getCargoFirms();
  return `${firms.length} cargo firm(s)`;
});

await section('2.2 shipping.listProfiles()', async () => {
  const profiles = await client.shipping.listProfiles();
  return `${profiles.length} shipping profile(s)`;
});

// ─── Claims (Phase 1b, OpenAPI spec — `oms-external` + `claim-stub`) ────

await section('3.1 claims.list({ offset: 0, limit: 2 })', async () => {
  const rows = await client.claims.list({ offset: 0, limit: 2 });
  return `${rows.length} claim(s)`;
});

await section("3.2 claims.listByStatus('AwaitingAction')", async () => {
  const rows = await client.claims.listByStatus('AwaitingAction', { offset: 0, limit: 2 });
  return `${rows.length} awaiting-action claim(s)`;
});

await section("3.3 claims.listByStatus('Cancelled')", async () => {
  const rows = await client.claims.listByStatus('Cancelled', { offset: 0, limit: 2 });
  return `${rows.length} cancelled claim(s)`;
});

// ─── Orders (Phase 2a/2b, doc-portal — `oms-external`) ──────────────────

await section('4.1 orders.list({ offset: 0, limit: 2 })', async () => {
  const page = await client.orders.list({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} payment-complete orders`;
});

await section('4.2 orders.listCancelled()', async () => {
  const page = await client.orders.listCancelled({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} cancelled orders`;
});

await section('4.3 orders.listPaymentAwaiting()', async () => {
  const page = await client.orders.listPaymentAwaiting({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} payment-awaiting orders`;
});

await section('4.4 orders.listPackages()', async () => {
  const pkgs = await client.orders.listPackages({ offset: 0, limit: 2 });
  return `${pkgs.length} package(s)`;
});

await section('4.5 orders.listShippedPackages()', async () => {
  const page = await client.orders.listShippedPackages({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} shipped packages`;
});

await section('4.6 orders.listDeliveredPackages()', async () => {
  const page = await client.orders.listDeliveredPackages({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} delivered packages`;
});

await section('4.7 orders.listUndeliveredPackages()', async () => {
  const page = await client.orders.listUndeliveredPackages({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} undelivered packages`;
});

await section('4.8 orders.listUnpackedPackages()', async () => {
  const page = await client.orders.listUnpackedPackages({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} unpacked packages`;
});

await section('4.9 orders.listMissingInvoicePackages()', async () => {
  const page = await client.orders.listMissingInvoicePackages({ offset: 0, limit: 2 });
  return `${page.items.length}/${page.totalCount} packages missing invoice`;
});

// ─── Categories (Phase 2a, doc-portal — `mpop`) ─────────────────────────

await section('5.1 categories.list({ page: 0, size: 2, leaf: true })', async () => {
  const page = await client.categories.list({ page: 0, size: 2, leaf: true });
  return `${page.numberOfElements}/${page.totalElements} leaf categories on page ${page.number}`;
});

await section('5.2 categories.getAttributes(leafId)', async () => {
  const cats = await client.categories.list({ page: 0, size: 200, leaf: true });
  const leaf = cats.data.find((c) => c.leaf && c.available) ?? cats.data.find((c) => c.leaf);
  if (!leaf) return '(no leaf category found to test)';
  const attrs = await client.categories.getAttributes(leaf.categoryId);
  return `${attrs.length} attrs on category ${leaf.categoryId} "${leaf.displayName}"`;
});

// ─── Catalog (Phase 2a/2b, doc-portal — `mpop`) ─────────────────────────

await section('6.1 catalog.listProducts({ page: 0, size: 2 })', async () => {
  const products = await client.catalog.listProducts({ page: 0, size: 2 });
  return `${products.length} catalog row(s)`;
});

await section('6.2 catalog.getTrackingIdHistory()', async () => {
  const rows = await client.catalog.getTrackingIdHistory();
  return `${rows.length} tracking-id history row(s)`;
});

// ─── productUpdates (Phase 2b, doc-portal — `oms-external`) ─────────────

await section('7.1 productUpdates.getUpdateStatus("fake-trk") — expect 401/404', async () => {
  await client.productUpdates.getUpdateStatus('fake-trk');
  return 'unexpected 200';
});

// ─── Suppliers (Phase 2b, doc-portal — `oms-external`) ──────────────────

await section('8.1 suppliers.getListingUpdateRequest("fake-id") — expect 401/404', async () => {
  await client.suppliers.getListingUpdateRequest('fake-id');
  return 'unexpected 200';
});

// ─── Accounting (Phase 2b, doc-portal — `oms-external`) ─────────────────

await section('9.1 accounting.listTransactions({ limit: 2 })', async () => {
  const rows = await client.accounting.listTransactions({
    offset: 0,
    limit: 2,
    beginDate: '2026-01-01',
    endDate: '2026-02-01',
  });
  return `${rows.length} transaction(s)`;
});

// ─── Questions (Phase 2b, doc-portal — `oms-external`) ──────────────────

await section('10.1 questions.list({ limit: 2 })', async () => {
  const rows = await client.questions.list({ limit: 2 });
  return `${rows.length} question(s)`;
});

await section('10.2 questions.getCountByStatus()', async () => {
  const summary = await client.questions.getCountByStatus();
  return `total=${summary.totalCount ?? '?'}`;
});

// ─── Promotions (Phase 2b, doc-portal — `oms-external`) ─────────────────

await section('11.1 promotions.listCategories()', async () => {
  const cats = await client.promotions.listCategories();
  return `${cats.length} promotion-eligible category(ies)`;
});

await section('11.2 promotions.getBudgets()', async () => {
  await client.promotions.getBudgets();
  return 'budgets returned';
});

await section('11.3 promotions.listDiscounts()', async () => {
  const rows = await client.promotions.listDiscounts();
  return `${rows.length} discount(s)`;
});

console.log('\n✅ Smoke complete.');
console.log(
  '   ✓ = endpoint reachable + 200 OK  ' +
    '🔒 = path recognized but sandbox merchant lacks scope (production should work)  ' +
    '✖ = unexpected error',
);
