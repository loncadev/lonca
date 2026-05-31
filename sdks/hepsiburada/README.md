# @lonca/hepsiburada

[![npm version](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada)

Type-safe TypeScript SDK for the [Hepsiburada Marketplace API](https://developers.hepsiburada.com).

> **`0.4.0` — Phase 2b: full dev-portal coverage.** Every operation documented on [developers.hepsiburada.com](https://developers.hepsiburada.com) — across 13 API products — is now typed and shipped. **95 methods across 12 resources.**
>
> Discovery method: the dev portal SPA exposes a hidden `/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` API that returns full OpenAPI-shape detail for every operation (method, path, parameters, requestBody, responses) even when the product's `versions` endpoint reports as empty. Phase 2b enumerated all 67 doc-only operations and merged them with the 29 spec-backed + 5 Phase 2a discovery-first endpoints.

## Coverage

| Resource           | Methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listings`         | `list({...})`, `getBuyboxOrder(skuList?)`, `getCommissions(skuList?)`, `activate(sku)`, `deactivate(sku)`, `updateSingle(hbSku, mSku, {...})`, `deleteSingle(hbSku, mSku)`, `bulkUnlock({hbSkuList})`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `listings` async   | `uploadInventory(items)` / `getInventoryUpload(id)`, `uploadStock(items)` / `getStockUpload(id)`, `uploadPrice(items)` / `getPriceUpload(id)`, `uploadShippingInfo(items)` / `getShippingInfoUpload(id)`, `uploadAdditionalInfo(items)` / `getAdditionalInfoUpload(id)`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `shipping`         | `getCargoFirms()`, `listProfiles()`, `createProfile(input)`, `updateProfile(input)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `claims`           | `list({...})`, `listByStatus(status, {...})`, `accept(claimNumber, input)`, `reject(claimNumber, input)`, `preApprovalConfirm(claimNumber, input)`, `create(input)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `testOrders`       | `create(input)` _(SIT sandbox only)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `orders` ▲         | `list`, `listCancelled`, `listPaymentAwaiting`, `getByOrderNumber`, `listPackages`, `listShippedPackages`, `listDeliveredPackages`, `listUndeliveredPackages`, `listUnpackedPackages`, `listMissingInvoicePackages`, `getPackage`, `getPackageLabel`, `getChangeableCargoCompaniesForLineItem`, `getChangeableCargoCompaniesForPackage`, `getPackageableLineItems`, `createPackages`, `splitPackage`, `unpackPackage`, `markPackageInTransit`, `markPackageDelivered`, `markPackageUndelivered`, `cancelLineItem`, `updateLineItemCargoCompany`, `updateLineItemLaborCost`, `updatePackageCargoCompany`, `sendInvoiceLink`, `updateParcelInfo`, `updatePackageWarehouse` |
| `categories` ▲     | `list({page?, size?, leaf?, status?, available?})`, `getAttributes(categoryId, {modifiedAtSince?})` _(leaf-only)_, `getAttributeValues(categoryId, attributeId)` _(leaf-only)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `catalog` ▲        | `listProducts`, `listProductsByStatus`, `getProductStatus(trackingId)`, `getTrackingIdHistory`, `uploadProductViaFile`, `uploadFastListing`, `approvePreMatch`, `rejectPreMatch`, `checkProductStatus`, `deleteByMerchantSkuList`, `getDeleteProcess(trackingId)`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `productUpdates` ▲ | `importUpdates(updates)`, `getUpdateStatus(trackingId)`, `getUpdateHistory(hbSku)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `suppliers` ▲      | `searchOpenPurchaseOrders`, `searchSupplierListings`, `searchListingUpdateRequests`, `getListingUpdateRequest(requestId)`, `createListingUpdateRequest`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `accounting` ▲     | `listTransactions({beginDate?, endDate?, offset?, limit?})`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `questions` ▲      | `list`, `get(number)`, `getCountByStatus`, `create`, `answer(number, input)`, `reject(number, input)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `promotions` ▲     | `listCategories`, `getBudgets`, `getLimits`, `listDiscounts`, `getDiscount(campaignId)`, `createTlDiscount`, `createPercentDiscount`, `createXyDiscount`, `cancelDiscount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

▲ = discovery-first or doc-only spec — shape derived from the dev portal `/operations` API; methods typed strictly per path / params / body schemas Hepsiburada publishes.

**Coverage status**: 13 of Hepsiburada's 20 dev-portal products are API-bearing — all 13 are now covered (29 OpenAPI-spec endpoints + 67 doc-only endpoints, deduplicated to 95 unique methods across 12 resources). The 7 uncovered products are pure documentation pages (`baslangic`, `entegrasyonda-sikca-sorulan-sorular`, `api-authentication`) plus 4 products whose `guides` count is `0` and `operations` count is `0` on the portal (`e-faturam` — SOAP/XML on a separate host, `ticket-yonetimi` — portal-only, `bildirim-merkezi`, `oms-fulfilment-entegrasyonu` — placeholder). When Hepsiburada publishes a REST surface for those, they land in the next minor.

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

## Discovery-first / doc-only resource notes

Most of Hepsiburada's API products don't ship a publicly-fetched OpenAPI spec — but the dev portal's hidden `/api/v1/public/docs/{co}/{slug}/{ver}/operations` API returns the same shape (method, path, parameters, requestBody, responses, examples) for every operation. Phase 2b uses that surface as the source of truth for ▲-marked resources. Three takeaways for users:

- **Strict fields are the documented top-level fields.** Every row carries an untouched `raw: Record<string, unknown>` for fields the SDK doesn't surface — undocumented fields stay available without a release.
- **Pagination shapes differ per surface.** OMS list endpoints use `{ totalCount, items }`; the unfiltered `/packages` list returns a raw array; the catalog API uses Spring-style `{ totalElements, totalPages, data }`. The SDK types each shape distinctly so callers know what to destructure.
- **Live-verified vs spec-only.** Phase 2b operations on `oms-external[-sit]` and `mpop[-sit]` are confirmed working against SIT (orders status-bucketed list returned **161 missing-invoice packages**). Doc-only resources whose sandbox merchant lacks the right scope (`productUpdates`, `suppliers`, `accounting`, `questions`, `promotions`) return `401`/`403` in SIT — paths are typed from the dev-portal spec, integrators with the right production scope can call them as-is.

If you discover an endpoint we missed or a field we don't surface, please open an issue with the response sample.

## Stability

`0.x` — alpha. **13 of Hepsiburada's 20 dev-portal products** are now covered (29 OpenAPI-spec + 67 doc-only operations, deduplicated to 95 unique methods across 12 resources). The remaining 7 products are documentation-only pages or empty placeholders on the dev portal; they'll be added when Hepsiburada publishes them.

## License

MIT
