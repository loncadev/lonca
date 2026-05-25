# @lonca/trendyol

[![npm version](https://img.shields.io/npm/v/@lonca/trendyol.svg)](https://www.npmjs.com/package/@lonca/trendyol)

Type-safe TypeScript SDK for the [Trendyol Marketplace API](https://developers.trendyol.com).

> **`0.3.0` — bottom-up Phase 2 complete.** The full product surface is now wire-verified: brands · categories · suppliers · products (read + write + lifecycle) · inventory · orders.

## Coverage

Each entry is a method on the client. Endpoints behind `★` are discovery-first wire-verified against live Trendyol STAGE — the SDK normalizes any spec/wire mismatch.

| Resource         | Methods                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `brands`         | `list()`, `search(name)` ★                                                                                                 |
| `categories`     | `list()`, `getAttributes(id)`, `getAttributeValues(catId, attrId)` ★, `getByBarcodes(barcodes)` (AutoFT)                   |
| `suppliers`      | `getAddresses({forceRefresh?})` (1-hour cache; rate-limited 1 req/hour on Trendyol)                                        |
| `products`       | `list({...})` ★, `listUnapproved({...})` ★, `getBase(barcode)`, `getBuyboxInfo(barcodes)`, `getBatchStatus(id)`            |
| `products` write | `create(items)`, `updateContent(items)`, `updateVariants(items)`, `updateUnapproved(items)` ★, `updateDeliveryInfo(items)` |
| `products` life  | `delete(barcodes)`, `archive(barcodes)`, `unarchive(barcodes)`, `unlock(barcodes)`                                         |
| `inventory`      | `update(items)` (stock + price, async batch) ★                                                                             |
| `orders`         | `list({...})` (shipment packages) ★                                                                                        |

Trendyol's product API has 12 V2 read/write/lifecycle endpoints — all 12 are covered. Categories V2 (tree + attributes + values + barcode→category lookup) is complete. V1 endpoints are intentionally skipped (Trendyol sunsets them August 2026). Order sub-endpoints (`updatePackageStatus`, `splitShipmentPackage`, returns, claims, webhooks) land in subsequent phases.

## Install

```bash
pnpm add @lonca/trendyol @lonca/core
# or npm install / yarn add
```

`@lonca/core` is a peer dependency (provides `paginate`, `CursorPage`, error classes, the token-bucket limiter).

## Quick start

```ts
import { createTrendyolClient } from '@lonca/trendyol';
import { paginate } from '@lonca/core';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'stage', // or 'prod'
  integratorName: 'MyCompany', // optional; defaults to 'SelfIntegration'
});

// Iterate every product page-by-page.
for await (const product of paginate((p) => client.products.list(p))) {
  for (const variant of product.variants) {
    console.log(variant.barcode, product.title, variant.stock ?? '?');
  }
}
```

## End-to-end: create a product

The chain `brand → category → category attributes (+ values) → addresses → create → poll → verify` is the canonical "create a real listing" flow.

```ts
import { createTrendyolClient } from '@lonca/trendyol';

const client = createTrendyolClient({ ... });

// 1. Resolve brand + category IDs.
const [brand] = await client.brands.search('TRENDYOLMİLLA');
const tree = await client.categories.list();
const category = findLeaf(tree, /Elbise/); // your own walker

// 2. Fetch required attributes + a value (Renk = Kırmızı).
const attrs = await client.categories.getAttributes(category.id);
const renk = attrs.find((a) => a.name === 'Renk')!;
const renkValues = await client.categories.getAttributeValues(category.id, renk.id);
const kirmizi = renkValues.items.find((v) => v.name === 'Kırmızı')!;

// 3. Resolve shipment / returning warehouse IDs.
const addresses = await client.suppliers.getAddresses();
const shipment = addresses.find((a) => a.isShipmentAddress)!;
const returning = addresses.find((a) => a.isReturningAddress)!;

// 4. Submit the create (async batch).
const { batchRequestId } = await client.products.create([
  {
    barcode: 'MY-SKU-001',
    title: 'Kırmızı Elbise',
    productMainId: 'MY-MAIN-001',
    brandId: Number(brand.id),
    categoryId: Number(category.id),
    quantity: 10,
    stockCode: 'MY-SC-001',
    dimensionalWeight: 1,
    description: '<p>...</p>',
    listPrice: 299.9,
    salePrice: 199.9,
    images: [{ url: 'https://cdn.example.com/dress.jpg' }],
    vatRate: 20,
    attributes: [{ attributeId: Number(renk.id), attributeValueIds: [Number(kirmizi.id)] }],
    shipmentAddressId: Number(shipment.id),
    returningAddressId: Number(returning.id),
  },
]);

// 5. Poll until Trendyol finishes content review.
let result;
do {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.products.getBatchStatus(batchRequestId);
} while (result.items[0]?.status === 'PROCESSING');

// 6. Detect approval (or surface a rejection reason).
if (result.items[0]?.status === 'SUCCESS') {
  const base = await client.products.getBase('MY-SKU-001');
  console.log('Approved:', base.approved, 'contentId:', base.contentId);
}
```

## Per-resource cheat sheet

```ts
// brands
await client.brands.list({ limit: 1000 });
await client.brands.search('TRENDYOLMİLLA'); // substring + case-insensitive

// categories
const tree = await client.categories.list();
const attrs = await client.categories.getAttributes(catId);
const values = await client.categories.getAttributeValues(catId, attrId);
await client.categories.getByBarcodes(['BC1', 'BC2']); // requires AutoFT enrollment

// suppliers (cached 1h)
await client.suppliers.getAddresses();
await client.suppliers.getAddresses({ forceRefresh: true });

// products — read
await client.products.list({ barcode: 'BC1' });
await client.products.listUnapproved({ limit: 50 });
await client.products.getBase('BC1');
await client.products.getBuyboxInfo(['BC1', 'BC2']); // max 10 per call
await client.products.getBatchStatus(batchRequestId);

// products — write (all return { batchRequestId }; max 1000 items)
await client.products.create([...]);
await client.products.updateContent([{ contentId: 123, title: '...' }]);
await client.products.updateVariants([{ barcode: 'BC1', stockCode: 'NEW' }]);
await client.products.updateUnapproved([{ barcode: 'BC1', title: '...', /* fuller payload */ }]);
await client.products.updateDeliveryInfo([{ barcode: 'BC1', deliveryOptions: { deliveryDuration: 3 } }]);

// products — lifecycle
await client.products.delete(['BC1']);     // separately rate-limited (100/min)
await client.products.archive(['BC1']);    // PUT archived=true
await client.products.unarchive(['BC1']);  // PUT archived=false
await client.products.unlock(['BC1']);     // restore after Trendyol price-lock

// inventory — async batch
await client.inventory.update([{ barcode: 'BC1', quantity: 50, salePrice: 199.9, listPrice: 299.9 }]);

// orders — shipment packages
for await (const pkg of paginate((p) => client.orders.list(p))) {
  console.log(pkg.id, pkg.status, pkg.lines.length);
}
```

## Async batch + polling

Every write endpoint (`products.create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`, `delete`, `archive`, `unarchive`, `unlock`, `inventory.update`) is **asynchronous**: Trendyol accepts the batch and returns a `{ batchRequestId }`. Poll the result with:

```ts
const status = await client.products.getBatchStatus(batchRequestId);
// status.status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
// status.items[].status: per-item outcome
```

**Important:** Trendyol's overall batch `status` can lag at `PROCESSING` even after each `items[].status` has settled. Trust the per-item status, or re-read the affected products via `list({ barcode })` / `getBase(barcode)` to verify the change landed. Batch results are retained for **4 hours** on Trendyol's side.

## Discovery-first wire fixes

`@lonca/trendyol` was built by hitting the live Trendyol STAGE for every endpoint before writing types. Several places where the official OpenAPI spec disagrees with the live wire are normalized automatically:

- `categories.getAttributeValues`: spec says `attributeValueName`, wire returns `attributeValue` → SDK normalizes to `{ id, name }`
- `products.listUnapproved`: spec says `media: [{url}]`, wire returns `images: [{url}]` → SDK exposes `images: string[]`
- `products.getBuyboxInfo`: wire returns extra `secondBuyboxPrice` / `thirdBuyboxPrice` fields beyond spec → both surfaced
- `products.updateUnapproved`: spec marks only `barcode` required, but live endpoint returns HTTP 500 (`TypeError`) when too many optional fields are omitted → documented in JSDoc
- `brands.search`: docs claim case-sensitive exact match, live is substring + case-insensitive → documented in JSDoc
- `getBatchRequestResult`: returns `PROCESSING + empty items` for unknown batch IDs (not 404)

Each fix is pinned by a regression mock test using the exact STAGE shape.

## Authentication

Trendyol uses HTTP Basic Auth. Get your `sellerId`, `apiKey`, and `apiSecret` from the [Trendyol Partner Panel → Account Info → Integration Information](https://partner.trendyol.com/account/info?tab=integrationInformation) (master-user only).

**Production vs Stage have different credentials.** Stage also requires IP whitelisting — register your CI/server IP with Trendyol support (0850 258 58 00). The SDK auto-sends the 5 mandatory headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`).

## Environments

| Env     | Base URL                          | Notes                                         |
| ------- | --------------------------------- | --------------------------------------------- |
| `prod`  | `https://apigw.trendyol.com`      | No IP whitelist                               |
| `stage` | `https://stageapigw.trendyol.com` | IP whitelist required — call Trendyol support |

## Built-in robustness

- **Retry with exponential backoff** on 429 (respects `Retry-After`) and 5xx
- **Per-endpoint rate limiting** (token bucket) sized to Trendyol's documented limits — separate buckets for filter (2000/min), batch read (1000/min), buybox (1000/min), writes (1000/min), and delete (100/min)
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Client-side validation** before the network: empty batches, oversized batches (>1000 items), >10 buybox barcodes throw `ValidationError`
- **Correlation ID** auto-generated per request for Trendyol-side log tracing
- **`AbortSignal` support** throughout

## Stability

`0.x` — alpha. The product surface is feature-complete and STAGE-verified, but public types may still adjust between minor versions until `1.0.0`.

## License

MIT
