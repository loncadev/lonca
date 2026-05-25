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

  // ── 3. Category attributes (first leaf we can find with attributes) ────
  // STAGE has many empty test categories — walk a few until one has attrs.
  const leaves = collectLeaves(tree);
  let leaf: { id: string; name: string } | null = null;
  let attrs: Awaited<ReturnType<typeof client.categories.getAttributes>> = [];
  for (const candidate of leaves.slice(0, 20)) {
    const list = await client.categories.getAttributes(candidate.id);
    if (list.length > 0) {
      leaf = candidate;
      attrs = list;
      break;
    }
  }
  if (leaf) {
    console.log(`\n── 3. categories.getAttributes(${leaf.id}) [${leaf.name}] ──`);
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

    // ── 3.5 Category attribute VALUES (V2) — fetch the catalog separately ──
    // Prefer an attribute likely to have a value catalog (slicer/varianter
    // or non-allowCustom). Free-text-only attributes return an empty page,
    // which is correct but not interesting to look at.
    const pickAttr =
      attrs.find((a) => a.slicer || a.varianter) ?? attrs.find((a) => !a.allowCustom) ?? attrs[0];
    if (pickAttr) {
      console.log(
        `\n── 3.5 categories.getAttributeValues(${leaf.id}, ${pickAttr.id}) [${pickAttr.name}] ──`,
      );
      try {
        const valuesPage = await client.categories.getAttributeValues(leaf.id, pickAttr.id, {
          limit: 5,
        });
        console.log(
          `✓ Got ${valuesPage.items.length} value(s)${valuesPage.nextCursor ? ` (nextCursor: ${valuesPage.nextCursor})` : ' (no more pages)'}`,
        );
        for (const v of valuesPage.items.slice(0, 5)) {
          console.log(`    ${v.id.padStart(8)}  ${v.name}`);
        }
      } catch (err) {
        console.error('✖ getAttributeValues failed:', formatError(err));
      }
    }
  } else {
    console.log('\n⚠ No leaf category found — skipping getAttributes');
  }
} catch (err) {
  console.error('✖ categories failed:', formatError(err));
}

// ── 1.5 brands.search (case-sensitive name lookup) ──────────────────────
console.log('\n── 1.5 brands.search("Trendyol") ─────────────────────────');
try {
  const hits = await client.brands.search('Trendyol');
  console.log(`✓ Got ${hits.length} match(es). First 5:`);
  for (const b of hits.slice(0, 5)) {
    console.log(`    ${b.id.padStart(8)}  ${b.name}`);
  }
} catch (err) {
  console.error('✖ brands.search failed:', formatError(err));
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
let firstApprovedBarcode: string | null = null;
console.log('\n── 5. products.list({ limit: 3 }) ────────────────────────');
try {
  const page = await client.products.list({ limit: 3 });
  console.log(
    `✓ Got ${page.items.length} product(s)${page.nextCursor ? ` (nextCursor: ${page.nextCursor.slice(0, 20)}…)` : ' (no more pages)'}`,
  );
  for (const p of page.items.slice(0, 3)) {
    const title = p.title.length > 48 ? `${p.title.slice(0, 45)}…` : p.title;
    const barcode = p.variants[0]?.barcode ?? '(no variant)';
    if (!firstApprovedBarcode && p.variants[0]?.barcode) {
      firstApprovedBarcode = p.variants[0].barcode;
    }
    console.log(`    ${barcode.padStart(16)}  ${title}  [${p.brand.name}, ${p.category.name}]`);
  }
} catch (err) {
  console.error('✖ products.list failed:', formatError(err));
}

// ── 5.1 products.listUnapproved (draft / rejected products) ─────────────
console.log('\n── 5.1 products.listUnapproved({ limit: 2 }) ──────────────');
try {
  const page = await client.products.listUnapproved({ limit: 2 });
  console.log(
    `✓ Got ${page.items.length} draft(s)${page.nextCursor ? ` (nextCursor: ${page.nextCursor.slice(0, 20)}…)` : ' (no more pages)'}`,
  );
  for (const u of page.items.slice(0, 2)) {
    const title = u.title.length > 40 ? `${u.title.slice(0, 37)}…` : u.title;
    console.log(
      `    ${u.barcode.padStart(16)}  ${u.status ?? '(no status)'.padEnd(10)}  ${title}  [${u.brand.name}]`,
    );
    if (u.rejectReasonDetails.length > 0) {
      console.log(`      └ rejected: ${u.rejectReasonDetails[0]!.rejectReason}`);
    }
  }
} catch (err) {
  console.error('✖ products.listUnapproved failed:', formatError(err));
}

// ── 5.2 products.getBase (basic lifecycle info for one barcode) ─────────
if (firstApprovedBarcode) {
  console.log(`\n── 5.2 products.getBase("${firstApprovedBarcode}") ─────────`);
  try {
    const base = await client.products.getBase(firstApprovedBarcode);
    console.log(
      `✓ approved=${base.approved} archived=${base.archived} contentId=${base.contentId ?? '(none)'} listingId=${base.listingId ?? '(none)'}`,
    );
    if (base.approvedAt) console.log(`     approvedAt: ${base.approvedAt}`);
  } catch (err) {
    console.error('✖ products.getBase failed:', formatError(err));
  }
}

// ── 5.3 products.getBuyboxInfo (max 10 barcodes per call) ───────────────
if (firstApprovedBarcode) {
  console.log(`\n── 5.3 products.getBuyboxInfo(["${firstApprovedBarcode}"]) ─────────`);
  try {
    const infos = await client.products.getBuyboxInfo([firstApprovedBarcode]);
    console.log(`✓ Got buybox info for ${infos.length} barcode(s)`);
    for (const i of infos) {
      console.log(
        `    ${i.barcode.padStart(16)}  order=${i.buyboxOrder ?? '?'}  price=${i.buyboxPrice ?? '?'}  multipleSeller=${i.hasMultipleSeller ?? '?'}  2nd=${i.secondBuyboxPrice ?? 'n/a'}  3rd=${i.thirdBuyboxPrice ?? 'n/a'}`,
      );
    }
  } catch (err) {
    console.error('✖ products.getBuyboxInfo failed:', formatError(err));
  }
}

// ── 6.4 products write smoke (5 endpoints) — STAGE-only ─────────────────
// Each endpoint is exercised with a payload Trendyol will accept at the
// batch level (returns batchRequestId) but reject per-item (fake barcode /
// contentId). This validates the wire contract without harming real seller
// data. STAGE-only; PROD is refused for safety.
if (process.env.TY_SKIP_PRODUCT_WRITES === '1') {
  console.log('\n⏭  Skipping products write smoke (TY_SKIP_PRODUCT_WRITES=1)');
} else if (env === 'prod') {
  console.log(
    '\n⚠ TY_ENV=prod — refusing to run write smoke. Set TY_ENV=stage or TY_SKIP_PRODUCT_WRITES=1.',
  );
} else {
  console.log('\n── 6.4 products write smoke (5 endpoints) ───────────────');
  const fakeBarcode = `LONCA-W-SMOKE-${Date.now()}`;
  // Probe a real product + real draft up-front so update endpoints have
  // real identifiers to operate on (Trendyol's V2 update endpoints reject
  // synthetic IDs synchronously with 400, which would mask a successful
  // wire contract). Falls back to fake values if probes fail.
  const realProduct = (await client.products.list({ limit: 1 }).catch(() => ({ items: [] })))
    .items[0];
  const realContentId = realProduct?.contentId ? Number(realProduct.contentId) : 999_999_999;
  const realApprovedBarcode = realProduct?.variants[0]?.barcode ?? fakeBarcode;

  type WriteCall = {
    name: string;
    call: () => Promise<{ batchRequestId: string }>;
  };
  const writeCalls: WriteCall[] = [
    {
      name: 'create',
      call: () =>
        client.products.create([
          {
            barcode: fakeBarcode,
            title: 'Lonca smoke test product (will fail validation)',
            productMainId: fakeBarcode,
            brandId: 1,
            categoryId: 1,
            quantity: 1,
            stockCode: fakeBarcode,
            dimensionalWeight: 1,
            description: '<p>smoke</p>',
            listPrice: 100,
            salePrice: 100,
            images: [{ url: 'https://example.com/lonca-smoke.jpg' }],
            vatRate: 20,
            attributes: [],
          },
        ]),
    },
    {
      name: 'updateContent',
      // Use a real contentId so Trendyol validates content rules, not
      // "contentId does not exist". A round-trip with the existing title is
      // a no-op — safe on STAGE.
      call: () =>
        client.products.updateContent([
          {
            contentId: realContentId,
            title: realProduct?.title ?? 'Lonca smoke updated title',
          },
        ]),
    },
    {
      name: 'updateVariants',
      // Real barcode + no-op stockCode change.
      call: () =>
        client.products.updateVariants([
          {
            barcode: realApprovedBarcode,
            stockCode: realProduct?.variants[0]?.raw?.stockCode
              ? String(realProduct.variants[0].raw.stockCode)
              : realApprovedBarcode,
          },
        ]),
    },
    {
      name: 'updateUnapproved',
      // Trendyol returns 500/TypeError when too many optional fields are
      // omitted (see resource JSDoc). Probe a real draft barcode and send a
      // fuller payload; fall back to skipping if no drafts exist.
      call: async () => {
        const drafts = await client.products.listUnapproved({ limit: 1 });
        const draft = drafts.items[0];
        if (!draft) {
          throw new Error('no unapproved drafts available to test updateUnapproved against');
        }
        return client.products.updateUnapproved([
          {
            barcode: draft.barcode,
            title: draft.title || 'Lonca smoke',
            description: draft.description || 'desc',
            productMainId: draft.productMainId || draft.barcode,
            brandId: draft.brand.id ? Number(draft.brand.id) : 1,
            categoryId: draft.category.id ? Number(draft.category.id) : 1,
            stockCode: draft.stockCode || draft.barcode,
            dimensionalWeight: draft.dimensionalWeight ?? 1,
            vatRate: draft.vatRate ?? 20,
            images: draft.images.length
              ? draft.images.map((url) => ({ url }))
              : [{ url: 'https://example.com/lonca-smoke.jpg' }],
            attributes: [],
          },
        ]);
      },
    },
    {
      name: 'updateDeliveryInfo',
      call: () =>
        client.products.updateDeliveryInfo([
          { barcode: realApprovedBarcode, deliveryOptions: { deliveryDuration: 3 } },
        ]),
    },
  ];

  for (const { name, call } of writeCalls) {
    try {
      const { batchRequestId } = await call();
      console.log(`✓ ${name.padEnd(20)} accepted; batchRequestId=${batchRequestId}`);
    } catch (err) {
      console.error(`✖ ${name.padEnd(20)} failed:`, formatError(err));
    }
  }
}

// ── 6.45 products lifecycle smoke (delete / archive / unarchive / unlock) ─
// All 4 mutate state. Strategy: pick a FAKE barcode for delete/unlock (will
// fail per-item but accepted at batch level), and exercise archive +
// unarchive as a pair on a real approved barcode (round-trip restores
// state). STAGE-only; PROD is refused.
if (process.env.TY_SKIP_PRODUCT_LIFECYCLE === '1') {
  console.log('\n⏭  Skipping products lifecycle smoke (TY_SKIP_PRODUCT_LIFECYCLE=1)');
} else if (env === 'prod') {
  console.log(
    '\n⚠ TY_ENV=prod — refusing to run lifecycle smoke. Set TY_ENV=stage or TY_SKIP_PRODUCT_LIFECYCLE=1.',
  );
} else {
  console.log('\n── 6.45 products lifecycle smoke ────────────────────────');
  const fakeLifecycleBarcode = `LONCA-LC-SMOKE-${Date.now()}`;
  const realApprovedForLc = firstApprovedBarcode;

  // delete — fake barcode is safe (Trendyol returns batchRequestId, per-item fails)
  try {
    const { batchRequestId } = await client.products.delete([fakeLifecycleBarcode]);
    console.log(`✓ delete       accepted; batchRequestId=${batchRequestId}`);
  } catch (err) {
    console.error('✖ delete failed:', formatError(err));
  }

  // archive → unarchive round-trip on a real approved barcode.
  if (realApprovedForLc) {
    try {
      const { batchRequestId: archiveId } = await client.products.archive([realApprovedForLc]);
      console.log(`✓ archive      accepted; batchRequestId=${archiveId}`);
      const { batchRequestId: unarchiveId } = await client.products.unarchive([realApprovedForLc]);
      console.log(`✓ unarchive    accepted; batchRequestId=${unarchiveId}  (state restored)`);
    } catch (err) {
      console.error('✖ archive/unarchive round-trip failed:', formatError(err));
    }
  } else {
    console.log('⚠ no real approved barcode — skipping archive/unarchive');
  }

  // unlock — fake barcode is safe.
  try {
    const { batchRequestId } = await client.products.unlock([fakeLifecycleBarcode]);
    console.log(`✓ unlock       accepted; batchRequestId=${batchRequestId}`);
  } catch (err) {
    console.error('✖ unlock failed:', formatError(err));
  }
}

// ── 5.5 categories.getByBarcodes (AutoFT — Export Center) ──────────────
if (firstApprovedBarcode) {
  console.log(`\n── 5.5 categories.getByBarcodes(["${firstApprovedBarcode}"]) ─────────`);
  try {
    const lookup = await client.categories.getByBarcodes([firstApprovedBarcode]);
    console.log(`✓ matches: ${lookup.matches.length}  notFound: ${lookup.notFound.length}`);
    for (const m of lookup.matches.slice(0, 3)) {
      console.log(
        `    ${m.barcode.padStart(16)}  → ${m.category.id.padStart(8)}  ${m.category.name}`,
      );
    }
    for (const nf of lookup.notFound.slice(0, 3)) {
      console.log(`    ✗ not found: ${nf}`);
    }
  } catch (err) {
    // Expected if seller is not enrolled in Trendyol Export Center (AutoFT).
    console.log(`ℹ getByBarcodes failed (likely AutoFT not enrolled): ${formatError(err)}`);
  }
}

// ── 6.7 orders write smoke (Phase 3a: status lifecycle) ─────────────────
// Each call uses a FAKE packageId so Trendyol rejects per-item without
// mutating any real package. A 4xx response with a well-formed error
// body proves the SDK is hitting the right path with the right body.
// STAGE-only; PROD is refused for safety.
if (process.env.TY_SKIP_ORDER_WRITES === '1') {
  console.log('\n⏭  Skipping orders write smoke (TY_SKIP_ORDER_WRITES=1)');
} else if (env === 'prod') {
  console.log(
    '\n⚠ TY_ENV=prod — refusing to run order-write smoke. Set TY_ENV=stage or TY_SKIP_ORDER_WRITES=1.',
  );
} else {
  console.log('\n── 6.7 orders write smoke (4 endpoints, fake packageId) ──');
  // Use an integer fake packageId — Trendyol's path security layer rejects
  // non-int packageIds with a bare 401 (not the per-handler 404 we want).
  const fakePkg = 999_999_999_999;

  type Call = { name: string; call: () => Promise<void> };
  const calls: Call[] = [
    {
      name: 'updatePackageStatus',
      call: () => client.orders.updatePackageStatus(fakePkg, { status: 'Picking' }),
    },
    {
      name: 'cancelPackageItem',
      call: () =>
        client.orders.cancelPackageItem(fakePkg, {
          lines: [{ lineId: 1, quantity: 1 }],
          reasonId: 577,
        }),
    },
    {
      name: 'extendDeliveryDate',
      call: () => client.orders.extendDeliveryDate(fakePkg, 1),
    },
    {
      name: 'processAlternativeDelivery',
      call: () =>
        client.orders.processAlternativeDelivery(fakePkg, {
          isPhoneNumber: false,
          trackingInfo: 'https://example.com/track/fake',
          params: {},
        }),
    },
  ];

  // Note: Trendyol returns 401 for unknown packageIds on these endpoints
  // (its gateway-level security layer rejects before reaching the handler),
  // 404/400 for malformed bodies. Both prove SDK→wire is intact.
  for (const { name, call } of calls) {
    try {
      await call();
      console.log(`✓ ${name.padEnd(28)} accepted (200) — unexpected for fake pkg`);
    } catch (err) {
      const msg = formatError(err);
      const code = /HTTP (\d{3})/.exec(msg)?.[1] ?? '?';
      const label = ['400', '401', '404'].includes(code)
        ? 'ℹ wire-verified (rejected, no real data touched)'
        : '✖';
      console.log(`${label} ${name.padEnd(28)} HTTP ${code}`);
    }
  }
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

// ── 6.7 Orders: list a small page ───────────────────────────────────────
console.log('\n── 6.7 orders.list({ limit: 2 }) ────────────────────────');
try {
  const page = await client.orders.list({ limit: 2 });
  console.log(
    `✓ Got ${page.items.length} package(s)${page.nextCursor ? ` (nextCursor: ${page.nextCursor})` : ' (no more pages)'}`,
  );
  for (const pkg of page.items.slice(0, 2)) {
    const customer = `${pkg.customer.firstName} ${pkg.customer.lastName}`.trim();
    const lineCount = pkg.lines.length;
    console.log(
      `    pkg ${pkg.id.padStart(10)}  order ${pkg.orderNumber}  ${pkg.status.padEnd(10)}  ${pkg.packageTotalPrice} ${pkg.currencyCode}  ${customer}  (${lineCount} line${lineCount === 1 ? '' : 's'})`,
    );
    for (const line of pkg.lines.slice(0, 3)) {
      const name =
        line.productName.length > 40 ? `${line.productName.slice(0, 37)}…` : line.productName;
      console.log(`      └ ${line.barcode.padStart(14)} × ${line.quantity}  ${name}`);
    }
  }
} catch (err) {
  console.error('✖ orders.list failed:', formatError(err));
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

function collectLeaves(
  nodes: Array<{
    id: string;
    name: string;
    subCategories: Array<{ id: string; name: string; subCategories: unknown[] }>;
  }>,
): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const n of nodes) {
    if (n.subCategories.length === 0) {
      out.push({ id: n.id, name: n.name });
    } else {
      out.push(...collectLeaves(n.subCategories as typeof nodes));
    }
  }
  return out;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    const status = (err as { status?: number }).status;
    return `${err.name}${code ? ` [${code}]` : ''}${status ? ` (HTTP ${status})` : ''}: ${err.message}`;
  }
  return String(err);
}
