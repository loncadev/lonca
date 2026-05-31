/**
 * Walk Hepsiburada's category tree end to end and print a structural
 * summary: leaf/non-leaf distribution, status / availability breakdown,
 * depth histogram, and a sample of attributes from a real leaf category.
 *
 * Run:
 *   pnpm try:inspect-hb-categories
 *
 * Uses the same env vars as `pnpm try:hepsiburada` (HB_MERCHANT_ID,
 * HB_API_USER, HB_API_PASS, HB_ENV, HB_INTEGRATOR_NAME).
 *
 * Read-only. Hits `categories.list` repeatedly until exhausted; one
 * `getAttributes` call against a representative leaf at the end.
 */

import { createHepsiburadaClient, type HepsiburadaEnvironment } from '@lonca/hepsiburada';

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

const PAGE_SIZE = 100;
/**
 * Safety cap against runaway pagination. Hepsiburada exposes ~27,000
 * categories; at PAGE_SIZE=100 the full walk is ~270 pages (~30s on a
 * fast connection). Set `HB_INSPECT_MAX_PAGES` to limit during dev.
 */
const HARD_PAGE_CAP = Number(process.env.HB_INSPECT_MAX_PAGES ?? 500);

const buckets = {
  total: 0,
  leaf: 0,
  available: 0,
  bothLeafAndAvailable: 0,
  byStatus: new Map<string, number>(),
  byDepth: new Map<number, number>(),
  byType: new Map<string, number>(),
};

let page = 0;
let pages = 0;
let last = false;
let firstAvailableLeaf: { categoryId: number; displayName: string } | undefined;

console.log(`\n🚀 Walking ${env.toUpperCase()} category tree (page size ${PAGE_SIZE})…\n`);

while (!last && pages < HARD_PAGE_CAP) {
  const result = await client.categories.list({ page, size: PAGE_SIZE });
  for (const c of result.data) {
    buckets.total++;
    if (c.leaf) buckets.leaf++;
    if (c.available) buckets.available++;
    if (c.leaf && c.available) {
      buckets.bothLeafAndAvailable++;
      if (!firstAvailableLeaf) {
        firstAvailableLeaf = { categoryId: c.categoryId, displayName: c.displayName };
      }
    }
    buckets.byStatus.set(c.status, (buckets.byStatus.get(c.status) ?? 0) + 1);
    buckets.byType.set(c.type, (buckets.byType.get(c.type) ?? 0) + 1);
    const depth = c.paths.length;
    buckets.byDepth.set(depth, (buckets.byDepth.get(depth) ?? 0) + 1);
  }
  pages++;
  process.stdout.write(
    `   page ${pages} → ${result.numberOfElements} rows (total seen ${buckets.total}/${result.totalElements})\r`,
  );
  last = result.last;
  page++;
}
process.stdout.write('\n');

console.log(`\n── Summary ────────────────────────────────────────`);
console.log(`Pages fetched          : ${pages}`);
console.log(`Categories seen        : ${buckets.total}`);
console.log(`Leaf (listable)        : ${buckets.leaf} (${pct(buckets.leaf, buckets.total)}%)`);
console.log(
  `Available              : ${buckets.available} (${pct(buckets.available, buckets.total)}%)`,
);
console.log(
  `Leaf AND available     : ${buckets.bothLeafAndAvailable} (${pct(buckets.bothLeafAndAvailable, buckets.total)}%)`,
);

console.log(`\n── By status ─────────────────────────────────────`);
for (const [status, count] of sortedByValueDesc(buckets.byStatus)) {
  console.log(`  ${status.padEnd(15)} ${String(count).padStart(6)}  ${pct(count, buckets.total)}%`);
}

console.log(`\n── By type ───────────────────────────────────────`);
for (const [type, count] of sortedByValueDesc(buckets.byType)) {
  console.log(`  ${type.padEnd(15)} ${String(count).padStart(6)}  ${pct(count, buckets.total)}%`);
}

console.log(`\n── Depth histogram (root path length) ───────────`);
const depths = [...buckets.byDepth.entries()].sort(([a], [b]) => a - b);
const max = Math.max(...depths.map(([, n]) => n));
for (const [depth, count] of depths) {
  const bar = '█'.repeat(Math.round((count / max) * 30));
  console.log(`  depth ${String(depth).padStart(2)}  ${String(count).padStart(5)} ${bar}`);
}

if (firstAvailableLeaf) {
  console.log(
    `\n── Sample attributes from a live leaf: ${firstAvailableLeaf.categoryId} "${firstAvailableLeaf.displayName}" ──`,
  );
  try {
    const attrs = await client.categories.getAttributes(firstAvailableLeaf.categoryId);
    console.log(`  ${attrs.length} attribute(s)`);
    for (const a of attrs.slice(0, 8)) {
      const flag = a.mandatory ? '★' : ' ';
      const sample = (a.values ?? []).slice(0, 3).map((v) => stringify(v));
      console.log(
        `  ${flag} ${String(a.name ?? a.id ?? '?').padEnd(28)}  values=${sample.join(', ')}${
          (a.values?.length ?? 0) > 3 ? ', …' : ''
        }`,
      );
    }
    if (attrs.length > 8) console.log(`  …and ${attrs.length - 8} more`);
  } catch (err) {
    console.log(`  ✖ getAttributes failed: ${(err as Error).message.slice(0, 100)}`);
  }
}

console.log('');

function pct(n: number, total: number) {
  return total === 0 ? '0.0' : ((n * 100) / total).toFixed(1);
}

function sortedByValueDesc<K>(map: Map<K, number>): [K, number][] {
  return [...map.entries()].sort(([, a], [, b]) => b - a);
}

function stringify(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.id === 'string' || typeof obj.id === 'number') return String(obj.id);
    return JSON.stringify(v).slice(0, 30);
  }
  return String(v);
}
