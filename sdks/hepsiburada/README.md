# @lonca/hepsiburada

[![npm version](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada)

Type-safe TypeScript SDK for the [Hepsiburada Marketplace API](https://developers.hepsiburada.com).

> **`0.3.0` — Phase 2a: Orders, Categories, Catalog Products.** Discovery-first probing against Hepsiburada SIT uncovered three additional surfaces under `mpop[-sit]` (Merchant Platform Operations) + `oms-external[-sit]`. **34 endpoints across 7 resources.**
>
> **Critical fix in this release:** `User-Agent` is now sent as the bare integrator name (e.g. `beekod_dev`) — previous versions (0.1.0 / 0.2.0) sent `{merchantId} - {integratorName}` which the SIT environment rejects with 401/403. **Live-verified against SIT.**

## Coverage

| Resource         | Methods                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listings`       | `list({...})`, `getBuyboxOrder(skuList?)`, `getCommissions(skuList?)`, `activate(sku)`, `deactivate(sku)`, `updateSingle(hbSku, mSku, {...})`, `deleteSingle(hbSku, mSku)`, `bulkUnlock({hbSkuList})`                                                                   |
| `listings` async | `uploadInventory(items)` / `getInventoryUpload(id)`, `uploadStock(items)` / `getStockUpload(id)`, `uploadPrice(items)` / `getPriceUpload(id)`, `uploadShippingInfo(items)` / `getShippingInfoUpload(id)`, `uploadAdditionalInfo(items)` / `getAdditionalInfoUpload(id)` |
| `shipping`       | `getCargoFirms()`, `listProfiles()`, `createProfile(input)`, `updateProfile(input)`                                                                                                                                                                                     |
| `claims`         | `list({...})`, `listByStatus(status, {...})`, `accept(claimNumber, input)`, `reject(claimNumber, input)`, `preApprovalConfirm(claimNumber, input)`, `create(input)`                                                                                                     |
| `testOrders`     | `create(input)` _(SIT sandbox only)_                                                                                                                                                                                                                                    |
| `orders` ★       | `list({status?, beginDate?, endDate?, offset?, limit?})`, `listPackages({status?, ...})`                                                                                                                                                                                |
| `categories` ★   | `list({page?, size?, leaf?})`, `getAttributes(categoryId)` _(leaf-only)_                                                                                                                                                                                                |
| `catalog` ★      | `listProducts({page?, size?})`                                                                                                                                                                                                                                          |

★ = discovery-first (no published OpenAPI; shapes derived from live SIT responses, see [Phase 2 notes](#phase-2-notes--discovery-first-resources)).

5 of Hepsiburada's 20 API products ship with machine-readable OpenAPI specs — all 5 covered in Phase 1a / 1b. Phase 2a adds 3 more surfaces via discovery-first probing against the sandbox. Remaining doc-only surfaces (suppliers, finance / settlements, e-invoice, tickets, notifications, questions, promotions) need either upstream spec publication or fresh sandbox endpoint information — see the "Future" section.

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

```ts
// Shipping
const firms = await client.shipping.getCargoFirms();
const profiles = await client.shipping.listProfiles();
await client.shipping.createProfile({ profileName: 'Express', cargoFirms: 'ARAS,MNG' });
await client.shipping.updateProfile({ profileName: 'Express', cargoFirms: 'ARAS' });

// Claims (returns / cancellations)
const open = await client.claims.list({
  beginDate: '2026-01-01 00:00',
  endDate: '2026-02-01 00:00',
  offset: 0,
  limit: 50,
});
const byStatus = await client.claims.listByStatus('Open', { offset: 0, limit: 50 });
await client.claims.accept('CLM-1', { reasonCode: 'APPROVED' });
await client.claims.reject('CLM-1', { reasonCode: 'NOT_ELIGIBLE' });
await client.claims.preApprovalConfirm('CLM-1', { confirmed: true });
await client.claims.create({
  orderNumber: 'O-1',
  lines: [
    /* ... */
  ],
});

// Test orders — SIT sandbox only
await client.testOrders.create({
  customer: {
    /* ... */
  },
  lines: [
    /* ... */
  ],
});
```

```ts
// Orders
const orders = await client.orders.list({ status: 'Open', limit: 100 });
console.log(`${orders.items.length}/${orders.totalCount} open orders`);

const packages = await client.orders.listPackages({ status: 'Open' });
for (const p of packages) console.log(p.packageNumber, p.cargoCompany);

// Categories (Hepsiburada has ~27,000 categories; filter to leaves to get listable ones)
const cats = await client.categories.list({ page: 0, size: 100, leaf: true });
console.log(
  `${cats.numberOfElements}/${cats.totalElements} leaf categories on page ${cats.number}`,
);

// Attribute definitions — leaf categories only; non-leaf throws ValidationError
const attrs = await client.categories.getAttributes(cats.data[0].categoryId);
for (const a of attrs) console.log(a.name, a.mandatory ? '(required)' : '');

// Catalog products — merchant's catalog rows with revision history
const products = await client.catalog.listProducts({ page: 0, size: 100 });
for (const p of products) console.log(p.merchantSku, p.status, `quality=${p.productQuality}`);
```

> **Claims body shapes** — Hepsiburada's published OpenAPI lists the paths but leaves request/response schemas empty. The SDK types the path params and known query params strictly, and accepts `Record<string, unknown>` for bodies — see the developer-portal doc pages for the documented field set. Dates use `yyyy-MM-dd HH:mm` format.

## Authentication + environments

Hepsiburada uses HTTP Basic Auth. Get your `merchantId`, `username`, and `password` from the [Hepsiburada Merchant Portal](https://merchant.hepsiburada.com) → Settings → Integrations.

| Env    | Service hostnames                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prod` | `listing-external` (listings) / `oms-external` (orders, packages, claims list/actions) / `shipping-external` (shipping) / `claim-stub-external` (claims create) / `oms-stub-external` (test orders) / `mpop` (catalog / categories / merchant products) — all `.hepsiburada.com` |
| `sit`  | same hostnames with `-sit` suffix — sandbox                                                                                                                                                                                                                                      |

The SDK auto-resolves the matching `*-external[-sit]` / `mpop[-sit]` hostname per service — each resource tags which service it belongs to.

**`User-Agent` is required** — Hepsiburada rejects requests without one. The SDK sends the bare `integratorName` you pass at construction time (e.g. `beekod_dev`). **Note:** versions `0.1.0` and `0.2.0` sent `{merchantId} - {integratorName}` which the API rejects with 401/403 — upgrade to ≥ `0.3.0` for working live calls.

## Built-in robustness

- **Retry with exponential backoff** on 429 (respects `Retry-After`) and 5xx
- **Per-resource rate limiting** (token bucket) — Hepsiburada doesn't publish per-endpoint limits, so the SDK provisions a generous 600 req/min default that you can override
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Client-side validation** — empty / >1000-item bulk uploads, `list({offset, limit})` argument checks, empty `bulkUnlock` — all throw `ValidationError` before hitting the wire
- **Multi-service base URLs** — each service's hostname resolved per env; resources tag which service they belong to
- **`AbortSignal` support** throughout

## Phase 2 notes — discovery-first resources

Hepsiburada's catalog / orders surfaces don't ship a public OpenAPI spec. The Phase 2a resources (`orders`, `categories`, `catalog`) were derived by probing the SIT sandbox directly and verifying response shapes against live data. Two takeaways for users:

- **Strict fields are the documented top-level fields** the SDK has seen on the wire. Every row carries an untouched `raw: Record<string, unknown>` for fields the SDK doesn't surface — undocumented fields stay available without a release.
- **Pagination shapes differ per surface.** OMS uses `{ totalCount, items }`; the catalog API uses Spring-style `{ totalElements, totalPages, data }`; some endpoints (packages, catalog products) return raw arrays with no envelope. The SDK types each shape distinctly so callers know what to destructure.

If you discover an endpoint we missed or a field we don't surface, please open an issue with the response sample — Phase 2b will close the remaining doc-only gaps.

## Stability

`0.x` — alpha. **8 of Hepsiburada's 20 API products** are covered (29 endpoints via OpenAPI + 5 endpoints via discovery-first = 34 endpoints across 7 resources). Remaining doc-only surfaces (suppliers, finance / settlements, e-invoice, tickets, notifications, questions, promotions) need either upstream OpenAPI publication or merchant-portal credentials for discovery-first probing — these land in Phase 2b as they become reachable.

## License

MIT
