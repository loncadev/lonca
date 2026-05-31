# @lonca/hepsiburada

[![npm version](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada)

Type-safe TypeScript SDK for the [Hepsiburada Marketplace API](https://developers.hepsiburada.com).

> **`0.1.0` — Phase 1a: Listings.** First slice of Hepsiburada coverage: the `listeleme` (Listings) surface with 18 typed endpoints — stock / price / shipping / additional-info bulk uploads, buybox + commission lookups, single-SKU mutations, bulk unlock.

## Coverage

| Resource         | Methods                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listings`       | `list({...})`, `getBuyboxOrder(skuList?)`, `getCommissions(skuList?)`, `activate(sku)`, `deactivate(sku)`, `updateSingle(hbSku, mSku, {...})`, `deleteSingle(hbSku, mSku)`, `bulkUnlock({hbSkuList})`                                                                   |
| `listings` async | `uploadInventory(items)` / `getInventoryUpload(id)`, `uploadStock(items)` / `getStockUpload(id)`, `uploadPrice(items)` / `getPriceUpload(id)`, `uploadShippingInfo(items)` / `getShippingInfoUpload(id)`, `uploadAdditionalInfo(items)` / `getAdditionalInfoUpload(id)` |

5 of Hepsiburada's 20 API products currently have machine-readable OpenAPI specs. Listings (`listeleme`) is the largest of those at 18 endpoints. Follow-up phases will cover shipping (`shipping-entegrasyonu`, 4 endpoints), claims (`talep-listeleme` + `talep-olusturma`, 6 endpoints), and the test-order utility (`test-siparisi-olusturma`, 1 endpoint). Catalog / product creation / orders need their specs to be published — or seller-portal credentials for discovery-first probing — before they land here.

## Install

```bash
pnpm add @lonca/hepsiburada @lonca/core
```

`@lonca/core` is a peer dependency (provides retry, rate limiter, error classes).

## Quick start

```ts
import { createHepsiburadaClient } from '@lonca/hepsiburada';

const client = createHepsiburadaClient({
  merchantId: '00000000-0000-0000-0000-000000000000',
  username: process.env.HB_API_USER!,
  password: process.env.HB_API_PASS!,
  env: 'sit', // or 'prod'
  integratorName: 'MyCompany',
});

// Read the first page of listings.
const page = await client.listings.list({ offset: 0, limit: 100 });
for (const l of page.listings) {
  console.log(l.hepsiburadaSku, l.merchantSku, l.availableStock, l.price);
}
```

## End-to-end: bulk price update

Every upload endpoint is asynchronous — Hepsiburada returns `{ id }` synchronously, you poll the matching `get*Upload(id)` to read the outcome (status + per-row errors).

```ts
// 1. Submit the batch.
const { id } = await client.listings.uploadPrice([
  { hepsiburadaSku: 'HB-1', price: 199.9 },
  { hepsiburadaSku: 'HB-2', price: 249.0 },
]);

// 2. Poll until it settles.
let result;
do {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.listings.getPriceUpload(id);
} while (result.status === 'PROCESSING');

// 3. Inspect floor/ceiling rejections (price-specific).
if (result.priceValidations?.length) {
  for (const v of result.priceValidations) {
    console.warn(`${v.hepsiburadaSku}: ${v.type} ${v.minPrice}–${v.maxPrice} (${v.description})`);
  }
}

// 4. Inspect per-row errors (shared across all upload kinds).
for (const e of result.errors) {
  console.error(`Row ${e.elementNo}: ${e.errors?.join(', ')}`);
}
```

## Per-resource cheat sheet

```ts
// Listings read
await client.listings.list({
  offset: 0,
  limit: 100,
  hbSkuList: 'HB-1,HB-2',
  salableListings: true,
  updateStartDate: '2026-01-01T00:00:00Z',
});
await client.listings.getBuyboxOrder('HB-1,HB-2'); // max 10 in practice
await client.listings.getCommissions('HB-1');

// Async bulk uploads (all max 1000 items; throw ValidationError on empty / >1000)
await client.listings.uploadInventory([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadStock([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadPrice([{ hepsiburadaSku: 'HB-1', price: 199.9 }]);
await client.listings.uploadShippingInfo([{ hepsiburadaSku: 'HB-1', dispatchTime: 2 }]);
await client.listings.uploadAdditionalInfo([
  { hepsiburadaSku: 'HB-1', customizationTextLength: 12 },
]);

// Poll the matching get*Upload(id) after each upload.

// Single-SKU mutations
await client.listings.activate('HB-1');
await client.listings.deactivate('HB-1');
await client.listings.updateSingle('HB-1', 'M-1', {
  newAvailableStock: 5,
  newPrice: { currency: 'TRY', amount: 199.9 },
  newDispatchTime: 2,
});
await client.listings.deleteSingle('HB-1', 'M-1');

// Bulk-unlock locked listings
await client.listings.bulkUnlock({ hbSkuList: ['HB-1', 'HB-2'] });
```

## Authentication + environments

Hepsiburada uses HTTP Basic Auth. Get your `merchantId`, `username`, and `password` from the [Hepsiburada Merchant Portal](https://merchant.hepsiburada.com) → Settings → Integrations.

| Env    | Service hostnames (listing service shown)        |
| ------ | ------------------------------------------------ |
| `prod` | `listing-external.hepsiburada.com`               |
| `sit`  | `listing-external-sit.hepsiburada.com` (sandbox) |

The SDK auto-resolves the matching `*-external[-sit]` hostname per service.

**`User-Agent` is required** — Hepsiburada rejects requests without one. The SDK builds it from `{merchantId} - {integratorName}` automatically (matches Trendyol's convention).

## Built-in robustness

- **Retry with exponential backoff** on 429 (respects `Retry-After`) and 5xx
- **Per-resource rate limiting** (token bucket) — Hepsiburada doesn't publish per-endpoint limits, so the SDK provisions a generous 600 req/min default that you can override
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Client-side validation** — empty / >1000-item bulk uploads, `list({offset, limit})` argument checks, empty `bulkUnlock` — all throw `ValidationError` before hitting the wire
- **Multi-service base URLs** — each service's hostname resolved per env; resources tag which service they belong to
- **`AbortSignal` support** throughout

## Stability

`0.x` — alpha. Only the Listings surface (Phase 1a) is implemented; expect new resources to land minor-by-minor as Hepsiburada publishes more OpenAPI specs / we secure sandbox credentials for the spec-less ones.

## License

MIT
