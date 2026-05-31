/**
 * Read-only walk of the Hepsiburada catalog surface. Surfaces the row
 * shape of `catalog.listProducts`, the per-status distribution via
 * `listProductsByStatus`, and any recent upload tracking IDs via
 * `getTrackingIdHistory`. If a tracking ID is found, drills into its
 * status to demonstrate the upload-poll cycle (without itself uploading
 * anything new).
 *
 * Run:
 *   pnpm try:inspect-hb-catalog
 *
 * Uses the same env vars as `pnpm try:hepsiburada`.
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

const STATUSES = [
  'Active',
  'WaitingApproval',
  'Rejected',
  'Suspended',
  'Draft',
  'WaitingMatching',
  'Closed',
];

console.log(`\n🚀 Inspecting ${env.toUpperCase()} catalog…\n`);

// ─── 1. listProducts: row shape + the 5 most-used fields ────────────────

console.log('── 1. catalog.listProducts (first 50 rows) ────────────');
let sampleProducts: Awaited<ReturnType<typeof client.catalog.listProducts>> = [];
try {
  sampleProducts = await client.catalog.listProducts({ page: 0, size: 50 });
  console.log(`   ✓ ${sampleProducts.length} catalog row(s) on the first page`);
} catch (err) {
  console.log(`   ✖ ${formatError(err)}`);
}

if (sampleProducts[0]) {
  const p = sampleProducts[0];
  console.log(`\n   First-row shape (top-level, non-raw):`);
  for (const [k, v] of Object.entries(p)) {
    if (k === 'raw') continue;
    if (k === 'fields' && v && typeof v === 'object') {
      const keys = Object.keys(v as object);
      console.log(
        `     fields                : ${keys.length} field(s) — ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}`,
      );
      continue;
    }
    console.log(`     ${k.padEnd(22)}: ${stringify(v)}`);
  }
}

// ─── 2. listProductsByStatus across the documented statuses ────────────

console.log(`\n── 2. catalog.listProductsByStatus per documented status ──`);
for (const status of STATUSES) {
  try {
    const rows = await client.catalog.listProductsByStatus({ status, page: 0, size: 5 });
    console.log(`   ${status.padEnd(20)} ${rows.length} row(s)`);
  } catch (err) {
    console.log(`   ${status.padEnd(20)} ✖ ${formatError(err)}`);
  }
}

// ─── 3. getTrackingIdHistory: recent upload activity ───────────────────

console.log(`\n── 3. catalog.getTrackingIdHistory (recent uploads) ───`);
let history: Awaited<ReturnType<typeof client.catalog.getTrackingIdHistory>> = [];
try {
  history = await client.catalog.getTrackingIdHistory();
  console.log(`   ✓ ${history.length} tracking-id row(s)`);
  for (const h of history.slice(0, 5)) {
    console.log(
      `     ${h.trackingId?.slice(0, 20).padEnd(20) ?? '(no id)'.padEnd(20)}  status=${h.status ?? '?'}  ${h.createdAt ?? ''}`,
    );
  }
} catch (err) {
  console.log(`   ✖ ${formatError(err)}`);
}

// ─── 4. Drill into a tracking ID's status (read-only) ───────────────────

console.log(`\n── 4. catalog.getProductStatus on the most-recent tracking ID ──`);
const trackingId = history[0]?.trackingId;
if (!trackingId) {
  console.log(`   (no tracking IDs in history — skip)`);
} else {
  try {
    const status = await client.catalog.getProductStatus(trackingId);
    console.log(`   ✓ status='${status.status ?? '?'}'  rows=${status.rows?.length ?? 0}`);
    if (status.message) console.log(`     message: ${status.message}`);
    if (status.rows?.length) {
      const first = status.rows[0]!;
      const keys = Object.keys(first).slice(0, 6);
      console.log(
        `     row[0] keys: ${keys.join(', ')}${Object.keys(first).length > 6 ? ', …' : ''}`,
      );
    }
  } catch (err) {
    console.log(`   ✖ ${formatError(err)}`);
  }
}

console.log('');

function stringify(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 50);
  return String(v).slice(0, 60);
}

function formatError(err: unknown): string {
  if (err instanceof LoncaError) return `${err.code} (${err.status ?? '?'})`;
  if (err instanceof Error) return err.message;
  return String(err);
}
