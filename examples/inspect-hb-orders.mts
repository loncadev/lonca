/**
 * Walk every Hepsiburada OMS status bucket and print counts + a sample
 * row shape per bucket. Surfaces the live distribution of orders /
 * packages on your sandbox so you can verify the SDK's surface matches
 * what your account actually sees.
 *
 * Run:
 *   pnpm try:inspect-hb-orders
 *
 * Uses the same env vars as `pnpm try:hepsiburada`.
 *
 * Read-only — no POST/PUT/DELETE calls.
 */

import { createHepsiburadaClient, type HepsiburadaEnvironment } from '@lonca/hepsiburada';
import { LoncaError } from '@lonca/core';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✖ Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const env = (process.env.HB_ENV ?? 'sit') as HepsiburadaEnvironment;
const client = createHepsiburadaClient({
  merchantId: required('HB_MERCHANT_ID'),
  username: required('HB_API_USER'),
  password: required('HB_API_PASS'),
  env,
  integratorName: process.env.HB_INTEGRATOR_NAME ?? 'LoncaInspect',
});

console.log(`\n🚀 Inspecting ${env.toUpperCase()} OMS buckets…\n`);

const PAGE = { offset: 0, limit: 5 };

// Pair label → fetcher. Fetcher returns either an OffsetPage<T> or T[].
const pages = [
  ['orders.list (payment-complete)', () => client.orders.list(PAGE)],
  ['orders.listCancelled', () => client.orders.listCancelled(PAGE)],
  ['orders.listPaymentAwaiting', () => client.orders.listPaymentAwaiting(PAGE)],
  ['orders.listPackages (raw array)', () => client.orders.listPackages(PAGE)],
  ['orders.listShippedPackages', () => client.orders.listShippedPackages(PAGE)],
  ['orders.listDeliveredPackages', () => client.orders.listDeliveredPackages(PAGE)],
  ['orders.listUndeliveredPackages', () => client.orders.listUndeliveredPackages(PAGE)],
  ['orders.listUnpackedPackages', () => client.orders.listUnpackedPackages(PAGE)],
  ['orders.listMissingInvoicePackages', () => client.orders.listMissingInvoicePackages(PAGE)],
] as const;

type Outcome =
  | { kind: 'ok'; label: string; total: string; first: Record<string, unknown> | undefined }
  | { kind: 'error'; label: string; reason: string };

const results: Outcome[] = [];

for (const [label, fn] of pages) {
  try {
    // Fetchers return heterogeneous shapes (OffsetPage<Order|ShippingPackage>
    // or a raw array); view items uniformly as plain records for the dump.
    const r = (await fn()) as unknown as
      | { totalCount: number; items: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const items = Array.isArray(r) ? r : r.items;
    const total = Array.isArray(r) ? `array(${r.length})` : `${r.totalCount.toLocaleString()}`;
    results.push({ kind: 'ok', label, total, first: items[0] });
  } catch (err) {
    let reason: string;
    if (err instanceof LoncaError) reason = `${err.code} (${err.status ?? '?'})`;
    else if (err instanceof Error) reason = err.message;
    else reason = String(err);
    results.push({ kind: 'error', label, reason });
  }
}

console.log(`── Counts per bucket ────────────────────────────────`);
for (const r of results) {
  if (r.kind === 'ok') {
    console.log(`  ✓ ${r.label.padEnd(42)} total=${r.total}`);
  } else {
    console.log(`  ✖ ${r.label.padEnd(42)} ${r.reason}`);
  }
}

console.log(`\n── Sample row shape per bucket (first item) ────────`);
for (const r of results) {
  if (r.kind !== 'ok' || !r.first) continue;
  console.log(`\n  [${r.label}]`);
  const flat = flatten(r.first, '', 0);
  const lines = flat.slice(0, 12);
  for (const [path, value] of lines) {
    console.log(`    ${path.padEnd(36)} ${truncate(value, 60)}`);
  }
  if (flat.length > 12) console.log(`    …and ${flat.length - 12} more keys`);
}

console.log('');

function flatten(obj: unknown, prefix: string, depth: number): [string, string][] {
  if (depth > 3 || obj == null) return [[prefix, String(obj)]];
  if (typeof obj !== 'object') return [[prefix, String(obj)]];
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [[`${prefix}[]`, '(empty)']];
    return [[`${prefix}[0..${obj.length - 1}]`, `array(${obj.length})`]];
  }
  if (prefix.endsWith('.raw')) return [[prefix, '(raw object — collapsed)']];

  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    if (v == null || typeof v !== 'object') out.push([path, String(v)]);
    else if (Array.isArray(v))
      out.push([`${path}[]`, v.length === 0 ? '(empty)' : `array(${v.length})`]);
    else out.push(...flatten(v, path, depth + 1));
  }
  return out;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
