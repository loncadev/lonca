/**
 * Smoke-test the @lonca/trendyol SDK against the real Trendyol API.
 *
 * Run:
 *   pnpm try:trendyol
 *
 * Required environment variables:
 *   TY_SELLER_ID  — your numeric seller (supplier) ID
 *   TY_API_KEY    — from Partner Panel → Account Info → Integration Information
 *   TY_API_SECRET — same place; only master users can see these
 *
 * Optional:
 *   TY_ENV               — 'prod' (default) or 'stage' (stage requires IP whitelist)
 *   TY_INTEGRATOR_NAME   — defaults to 'LoncaSmokeTest'
 *   TY_SKIP_SUPPLIERS    — set to '1' to skip the suppliers call
 *                          (suppliers is rate-limited to 1 req/hour;
 *                          skip if you've already hit it recently)
 */

import { paginate } from '@lonca/core';
import { createTrendyolClient, type TrendyolEnvironment } from '@lonca/trendyol';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✖ Missing required env var: ${name}`);
    console.error('  See examples/try-trendyol.ts for the full list.');
    process.exit(1);
  }
  return value;
}

const sellerId = Number(required('TY_SELLER_ID'));
if (!Number.isFinite(sellerId)) {
  console.error('✖ TY_SELLER_ID must be a number');
  process.exit(1);
}

const env = (process.env.TY_ENV ?? 'prod') as TrendyolEnvironment;
if (env !== 'prod' && env !== 'stage') {
  console.error(`✖ TY_ENV must be 'prod' or 'stage' (got: ${env})`);
  process.exit(1);
}

const client = createTrendyolClient({
  sellerId,
  apiKey: required('TY_API_KEY'),
  apiSecret: required('TY_API_SECRET'),
  env,
  integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaSmokeTest',
});

console.log(`\n🚀 Hitting Trendyol ${env.toUpperCase()} as seller ${sellerId}\n`);

// ── 1. Brands ────────────────────────────────────────────────────────────
console.log('── 1. brands.list({ limit: 5 }) ──────────────────────────');
try {
  const page = await client.brands.list({ limit: 5 });
  console.log(
    `✓ Got ${page.items.length} brand(s)${page.nextCursor ? ` (nextCursor: ${page.nextCursor})` : ' (no more pages)'}`,
  );
  for (const b of page.items.slice(0, 5)) {
    console.log(`    ${b.id.padStart(8)}  ${b.name}`);
  }
} catch (err) {
  console.error('✖ brands.list failed:', formatError(err));
}

// ── 2. Categories tree ───────────────────────────────────────────────────
console.log('\n── 2. categories.list() ──────────────────────────────────');
try {
  const tree = await client.categories.list();
  console.log(`✓ Tree has ${tree.length} root categories. Top-level names:`);
  for (const root of tree.slice(0, 10)) {
    const childCount = root.subCategories.length;
    console.log(
      `    ${root.id.padStart(8)}  ${root.name}  (${childCount} subcategor${childCount === 1 ? 'y' : 'ies'})`,
    );
  }
  if (tree.length > 10) console.log(`    … and ${tree.length - 10} more`);

  // ── 3. Category attributes (first leaf we can find) ────────────────────
  const leaf = findFirstLeaf(tree);
  if (leaf) {
    console.log(`\n── 3. categories.getAttributes(${leaf.id}) [${leaf.name}] ──`);
    const attrs = await client.categories.getAttributes(leaf.id);
    console.log(`✓ Got ${attrs.length} attribute(s). First 3:`);
    for (const a of attrs.slice(0, 3)) {
      const flags = [
        a.required ? 'required' : null,
        a.varianter ? 'variant' : null,
        a.slicer ? 'slicer' : null,
        a.allowCustom ? 'allowCustom' : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `    ${a.id.padStart(8)}  ${a.name}  [${flags || 'none'}]  ${a.values.length} value(s)`,
      );
    }
  } else {
    console.log('\n⚠ No leaf category found — skipping getAttributes');
  }
} catch (err) {
  console.error('✖ categories failed:', formatError(err));
}

// ── 4. Suppliers (1 req/hour rate limit; skippable) ──────────────────────
if (process.env.TY_SKIP_SUPPLIERS === '1') {
  console.log('\n⏭  Skipping suppliers.getAddresses (TY_SKIP_SUPPLIERS=1)');
} else {
  console.log('\n── 4. suppliers.getAddresses() ───────────────────────────');
  try {
    const addresses = await client.suppliers.getAddresses();
    console.log(`✓ Got ${addresses.length} address(es):`);
    for (const a of addresses.slice(0, 10)) {
      const flags = [
        a.isShipmentAddress ? 'shipment' : null,
        a.isReturningAddress ? 'returning' : null,
        a.isInvoiceAddress ? 'invoice' : null,
        a.isDefault ? 'default' : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(`    ${a.id.padStart(8)}  ${a.name ?? '(no name)'}  [${flags || 'none'}]`);
    }
  } catch (err) {
    console.error('✖ suppliers.getAddresses failed:', formatError(err));
  }
}

// ── 5. Products: list a small page ───────────────────────────────────────
console.log('\n── 5. products.list({ limit: 3 }) ────────────────────────');
try {
  const page = await client.products.list({ limit: 3 });
  console.log(
    `✓ Got ${page.items.length} product(s)${page.nextCursor ? ` (nextCursor: ${page.nextCursor.slice(0, 20)}…)` : ' (no more pages)'}`,
  );
  for (const p of page.items.slice(0, 3)) {
    const title = p.title.length > 48 ? `${p.title.slice(0, 45)}…` : p.title;
    const barcode = p.variants[0]?.barcode ?? '(no variant)';
    console.log(`    ${barcode.padStart(16)}  ${title}  [${p.brand.name}, ${p.category.name}]`);
  }
} catch (err) {
  console.error('✖ products.list failed:', formatError(err));
}

// ── 6.5 inventory.update — full round-trip with a REAL product ──────────
// Fetches a real product, bumps its stock by +1, polls until the batch
// completes, then re-fetches and verifies the change. STAGE-only by default.
//
// Set TY_SKIP_INVENTORY=1 to skip entirely.
if (process.env.TY_SKIP_INVENTORY === '1') {
  console.log('\n⏭  Skipping inventory.update (TY_SKIP_INVENTORY=1)');
} else {
  console.log('\n── 6.5 inventory.update — REAL round-trip ───────────────');
  if (env === 'prod') {
    console.log(
      '⚠ TY_ENV=prod — refusing to mutate stock in PROD. Set TY_ENV=stage for this section, or TY_SKIP_INVENTORY=1.',
    );
  } else {
    try {
      // 1. Pick a real product + variant.
      const probe = await client.products.list({ limit: 1 });
      const product = probe.items[0];
      const variant = product?.variants[0];
      if (!product || !variant) {
        console.log('⚠ No product/variant found to test against — skipping');
      } else {
        const currentStock = variant.stock ?? 0;
        const newStock = currentStock + 1;
        console.log(
          `     variant: ${variant.barcode}  current stock: ${currentStock} → new: ${newStock}`,
        );

        // 2. Submit the update.
        const { batchRequestId } = await client.inventory.update([
          { barcode: variant.barcode, quantity: newStock },
        ]);
        console.log(`✓ inventory.update accepted; batchRequestId=${batchRequestId}`);

        // 3. Poll until the per-item status finalizes (not just overall — see note).
        // Note: Trendyol's overall batch `status` can stay PROCESSING for tens
        // of seconds even after `items[0].status` has settled. Trust the
        // per-item status (or the verify step below) rather than overall.
        const start = Date.now();
        const timeoutMs = 30_000;
        let status = await client.products.getBatchStatus(batchRequestId);
        const itemSettled = (s: typeof status) => {
          const first = s.items[0];
          return first?.status !== undefined && first.status !== 'PROCESSING';
        };
        while (!itemSettled(status) && Date.now() - start < timeoutMs) {
          await new Promise((res) => setTimeout(res, 1500));
          status = await client.products.getBatchStatus(batchRequestId);
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(
          `✓ poll done after ${elapsed}s — overall: ${status.status}, items: ${status.items.length}`,
        );
        const item = status.items[0];
        if (item) {
          console.log(
            `     first item: status=${item.status} reasons=${JSON.stringify(item.failureReasons)}`,
          );
        }

        // 4. Verify via filter-by-barcode.
        const verify = await client.products.list({ barcode: variant.barcode });
        const updatedStock = verify.items[0]?.variants[0]?.stock;
        const passed = updatedStock === newStock;
        console.log(
          `${passed ? '✓' : '✖'} verify via products.list(barcode): stock now ${updatedStock} (expected ${newStock})`,
        );
      }
    } catch (err) {
      console.error('✖ inventory round-trip failed:', formatError(err));
    }
  }
}

// ── 6. Products: batch status of a (non-existent) batchRequestId ─────────
console.log('\n── 6. products.getBatchStatus("smoke-test-fake-id") ──────');
try {
  const result = await client.products.getBatchStatus('smoke-test-fake-id');
  console.log(`✓ Batch status: ${result.status} (items: ${result.items.length})`);
  console.log('  raw keys:', Object.keys(result.raw).join(', '));
} catch (err) {
  // 404 is the expected outcome here — a non-existent batchId.
  console.log(`ℹ getBatchStatus errored as expected: ${formatError(err)}`);
}

console.log('\n✅ Done.');

function findFirstLeaf(
  nodes: Array<{
    id: string;
    name: string;
    subCategories: Array<{ id: string; name: string; subCategories: unknown[] }>;
  }>,
): { id: string; name: string } | null {
  for (const n of nodes) {
    if (n.subCategories.length === 0) return n;
    const child = findFirstLeaf(n.subCategories as typeof nodes);
    if (child) return child;
  }
  return null;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    const status = (err as { status?: number }).status;
    return `${err.name}${code ? ` [${code}]` : ''}${status ? ` (HTTP ${status})` : ''}: ${err.message}`;
  }
  return String(err);
}
