# @lonca/hepsiburada

[![npm version](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada)

Type-safe TypeScript SDK for the [Hepsiburada Marketplace API](https://developers.hepsiburada.com). Covers every operation documented on the developer portal — **95 methods across 12 resources**, live-verified against SIT.

## Coverage

| Resource         | Methods | Host                                   | Source                         |
| ---------------- | ------: | -------------------------------------- | ------------------------------ |
| `listings`       |      18 | `listing-external[-sit]`               | OpenAPI spec                   |
| `shipping`       |       4 | `shipping-external[-sit]`              | OpenAPI spec                   |
| `claims`         |       6 | `oms-external[-sit]` + `claim-stub`    | OpenAPI spec                   |
| `testOrders`     |       1 | `oms-stub-external[-sit]` _(SIT only)_ | OpenAPI spec                   |
| `orders`         |      28 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `categories`     |       3 | `mpop[-sit]` (`/product/api/*`)        | Dev-portal `/operations` API ★ |
| `catalog`        |      11 | `mpop[-sit]` (`/product/api/*`)        | Dev-portal `/operations` API ★ |
| `productUpdates` |       3 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `suppliers`      |       5 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `accounting`     |       1 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `questions`      |       6 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `promotions`     |       9 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |

★ Hepsiburada publishes machine-readable OpenAPI for 5 of its 20 dev-portal products. The other 7 API-bearing products are typed from a hidden `/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` endpoint that returns the same OpenAPI shape (method / path / parameters / requestBody / responses).

**Status**: 13 of Hepsiburada's 20 dev-portal products covered. The remaining 7 are documentation pages (`baslangic`, `entegrasyonda-sikca-sorulan-sorular`, `api-authentication`) or empty placeholders (`e-faturam` is SOAP/XML on a separate host, `ticket-yonetimi` is portal-only, `bildirim-merkezi` / `oms-fulfilment-entegrasyonu` have zero published operations).

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
  integratorName: 'MyCompany', // server-side integrator name
});

const page = await client.listings.list({ offset: 0, limit: 100 });
for (const l of page.listings) {
  console.log(l.hepsiburadaSku, l.merchantSku, l.availableStock, l.price);
}
```

## Authentication & environments

Hepsiburada uses HTTP Basic Auth + a required `User-Agent`. Get `merchantId`, `username`, and `password` from [Merchant Portal](https://merchant.hepsiburada.com) → Settings → Integrations.

| Env    | Hostname suffix                   |
| ------ | --------------------------------- |
| `prod` | `*.hepsiburada.com`               |
| `sit`  | `*-sit.hepsiburada.com` (sandbox) |

The SDK auto-resolves the matching host per resource — see the Coverage table for the per-resource host.

**`User-Agent`** is the bare integrator name you pass at construction time (e.g. `MyCompany`). Hepsiburada rejects requests without a meaningful User-Agent.

## End-to-end flows

### 1) Bulk price update (async upload + polling)

Every upload endpoint is asynchronous — Hepsiburada returns `{ id }` synchronously, you poll the matching `get*Upload(id)` to read the outcome.

```ts
const { id } = await client.listings.uploadPrice([
  { hepsiburadaSku: 'HB-1', price: 199.9 },
  { hepsiburadaSku: 'HB-2', price: 249.0 },
]);

let result;
do {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.listings.getPriceUpload(id);
} while (result.status === 'PROCESSING');

// Floor / ceiling rejections (price-specific)
for (const v of result.priceValidations ?? []) {
  console.warn(`${v.hepsiburadaSku}: ${v.type} ${v.minPrice}–${v.maxPrice}`);
}

// Per-row errors (shared across all upload kinds)
for (const e of result.errors) {
  console.error(`Row ${e.elementNo}: ${e.errors?.join(', ')}`);
}
```

The same shape applies to `uploadInventory`, `uploadStock`, `uploadShippingInfo`, `uploadAdditionalInfo`.

### 2) Order fulfillment lifecycle

```ts
// 1. Discover orders awaiting packaging
const open = await client.orders.list({ limit: 100 });

// 2. Find line items that can be packaged together
for (const order of open.items) {
  const orderDetail = await client.orders.getByOrderNumber(order.orderNumber!);
  const lineId = (orderDetail.raw as { lineItems?: { id: string }[] }).lineItems?.[0]?.id;
  if (!lineId) continue;

  const peers = await client.orders.getPackageableLineItems(lineId);

  // 3. Package the items
  await client.orders.createPackages({
    lineItems: [lineId, ...peers.map((p) => (p as { id: string }).id)],
    cargoCompany: 'ARAS',
  });
}

// 4. As the cargo firm scans / delivers, transition status
await client.orders.markPackageInTransit('HBP-123', { trackingNumber: 'TR-456' });
await client.orders.markPackageDelivered('HBP-123');
// or, on a failed delivery:
await client.orders.markPackageUndelivered('HBP-123', { reason: 'address-not-found' });

// 5. Attach an invoice link before delivery
await client.orders.sendInvoiceLink('HBP-123', {
  invoiceUrl: 'https://my-erp.example/inv/HBP-123.pdf',
  invoiceNumber: 'INV-2026-00123',
});

// 6. Status-bucketed lists for reconciliation
const missingInvoice = await client.orders.listMissingInvoicePackages({ limit: 100 });
console.log(`${missingInvoice.totalCount} shipped packages still missing invoice`);
```

### 3) Catalog product upload + status polling

```ts
// 1. Submit one or more new products
const { trackingId } = await client.catalog.uploadProductViaFile([
  {
    categoryId: 18021982,
    merchant: process.env.HB_MERCHANT_ID,
    attributes: {
      merchantSku: 'SKU-001',
      Barcode: '8690000000001',
      // ...all category-specific attributes
    },
  },
]);

// 2. Poll for completion (status returns DONE / FAILED / IN_PROGRESS)
let status;
do {
  await new Promise((r) => setTimeout(r, 5000));
  status = await client.catalog.getProductStatus(trackingId);
} while (status.status === 'IN_PROGRESS');

if (status.status === 'FAILED') {
  for (const row of status.rows ?? []) console.error(row);
}

// 3. Read your catalog rows with revision history
const products = await client.catalog.listProducts({ page: 0, size: 100 });
for (const p of products) {
  console.log(p.merchantSku, p.status, `quality=${p.productQuality}`);
}

// 4. Or filter to a specific lifecycle status
const waiting = await client.catalog.listProductsByStatus({ status: 'WaitingApproval' });
```

### 4) Returns / claims handling

```ts
// 1. Pull claims awaiting your action (strict enum — see ClaimStatus type)
const awaiting = await client.claims.listByStatus('AwaitingAction', { limit: 100 });

// 2. Drive the action
for (const claim of awaiting) {
  // Inspect claim.raw for category, reason code, items
  const decision = decideAccept(claim); // your business logic
  if (decision === 'accept') {
    await client.claims.accept(claim.claimNumber!, { reasonCode: 'APPROVED' });
  } else if (decision === 'reject') {
    await client.claims.reject(claim.claimNumber!, { reasonCode: 'NOT_ELIGIBLE' });
  } else {
    await client.claims.preApprovalConfirm(claim.claimNumber!, { confirmed: true });
  }
}
```

## Per-resource reference

### `listings` — stock / price / buybox / single-SKU mutations (18 methods)

```ts
// Read
await client.listings.list({
  offset: 0,
  limit: 100,
  hbSkuList: 'HB-1,HB-2',
  salableListings: true,
});
await client.listings.getBuyboxOrder('HB-1,HB-2'); // skuList REQUIRED (live API rejects empty)
await client.listings.getCommissions('HB-1'); // skuList REQUIRED

// Single-SKU mutations
await client.listings.activate('HB-1');
await client.listings.deactivate('HB-1');
await client.listings.updateSingle('HB-1', 'M-1', {
  newAvailableStock: 5,
  newPrice: { currency: 'TRY', amount: 199.9 },
  newDispatchTime: 2,
});
await client.listings.deleteSingle('HB-1', 'M-1');
await client.listings.bulkUnlock({ hbSkuList: ['HB-1', 'HB-2'] });

// Async bulk uploads — all 5 follow the {id} → poll pattern shown above
await client.listings.uploadInventory([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadStock([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadPrice([{ hepsiburadaSku: 'HB-1', price: 199.9 }]);
await client.listings.uploadShippingInfo([{ hepsiburadaSku: 'HB-1', dispatchTime: 2 }]);
await client.listings.uploadAdditionalInfo([
  { hepsiburadaSku: 'HB-1', customizationTextLength: 12 },
]);
// Each upload returns { id } — poll get<Kind>Upload(id) until status !== 'PROCESSING'
```

### `shipping` — cargo firms + shipping profiles (4 methods)

```ts
const firms = await client.shipping.getCargoFirms();
const profiles = await client.shipping.listProfiles();
await client.shipping.createProfile({ profileName: 'Express', cargoFirms: 'ARAS,MNG' });
await client.shipping.updateProfile({ profileName: 'Express', cargoFirms: 'ARAS' });
```

### `orders` — full OMS surface (28 methods)

```ts
// Order lists
await client.orders.list({ beginDate: '2026-01-01', limit: 100 });
await client.orders.listCancelled({ limit: 100 });
await client.orders.listPaymentAwaiting({ limit: 100 });
await client.orders.getByOrderNumber('HBO-12345');

// Package lists (status-bucketed)
await client.orders.listPackages({ limit: 100 }); // raw array, no envelope
await client.orders.listShippedPackages({ limit: 100 });
await client.orders.listDeliveredPackages({ limit: 100 });
await client.orders.listUndeliveredPackages({ limit: 100 });
await client.orders.listUnpackedPackages({ limit: 100 });
await client.orders.listMissingInvoicePackages({ limit: 100 });
await client.orders.getPackage('HBP-1');
await client.orders.getPackageLabel('HBP-1'); // PDF / barcode

// Packaging mutations
await client.orders.createPackages({ lineItems: ['L1', 'L2'], cargoCompany: 'ARAS' });
await client.orders.splitPackage('HBP-1', { lineItems: ['L1'] });
await client.orders.unpackPackage('HBP-1');

// Status transitions
await client.orders.markPackageInTransit('HBP-1', { trackingNumber: 'TR-1' });
await client.orders.markPackageDelivered('HBP-1');
await client.orders.markPackageUndelivered('HBP-1', { reason: '...' });

// Line-item actions
await client.orders.cancelLineItem('L1', { reason: 'out-of-stock' });
await client.orders.updateLineItemCargoCompany('L1', { cargoCompany: 'MNG' });
await client.orders.updateLineItemLaborCost('L1', { laborCost: 12.5 });

// Package field updates
await client.orders.updatePackageCargoCompany('HBP-1', { cargoCompany: 'YURTICI' });
await client.orders.sendInvoiceLink('HBP-1', { invoiceUrl: '...', invoiceNumber: '...' });
await client.orders.updateParcelInfo('HBP-1', { desi: 8, width: 30, height: 20, length: 40 });
await client.orders.updatePackageWarehouse('HBP-1', { warehouseId: 'WH-2' });

// Cargo-company-change discovery
await client.orders.getChangeableCargoCompaniesForLineItem('L1');
await client.orders.getChangeableCargoCompaniesForPackage('HBP-1');
await client.orders.getPackageableLineItems('L1');
```

### `claims` — returns + accept/reject/preApproval (6 methods)

```ts
import type { ClaimStatus } from '@lonca/hepsiburada';

// status param is a strict union:
//   'NewRequest' | 'Accepted' | 'AwaitingAction' | 'InDispute'
//   | 'Rejected' | 'Refunded' | 'Cancelled' | 'AwaitingPreApproval'
await client.claims.list({ beginDate: '2026-01-01 00:00', limit: 50 });
await client.claims.listByStatus('AwaitingAction', { limit: 50 });

await client.claims.accept('CLM-1', { reasonCode: 'APPROVED' });
await client.claims.reject('CLM-1', { reasonCode: 'NOT_ELIGIBLE' });
await client.claims.preApprovalConfirm('CLM-1', { confirmed: true });

// Create a new claim (routes to a different host: claim-stub)
await client.claims.create({
  orderNumber: 'O-1',
  lines: [
    /* ... */
  ],
});
```

Dates use `yyyy-MM-dd HH:mm` format.

### `categories` — Hepsiburada catalog tree (3 methods)

```ts
// ~27,000 categories — paginate; filter to leaves for listable ones
const page = await client.categories.list({ page: 0, size: 100, leaf: true });
console.log(`${page.numberOfElements}/${page.totalElements} leaf categories`);

// Attribute definitions — leaf categories only
const attrs = await client.categories.getAttributes(page.data[0].categoryId);

// Enum values for an attribute (for dropdowns like Color, Size)
const values = await client.categories.getAttributeValues(page.data[0].categoryId, attrs[0].id!);
```

### `catalog` — merchant product CRUD (11 methods)

```ts
// Read
await client.catalog.listProducts({ page: 0, size: 100 });
await client.catalog.listProductsByStatus({ status: 'Active' });
await client.catalog.getProductStatus('trk-id'); // status of a previous upload
await client.catalog.getTrackingIdHistory();

// Create / update via async upload (returns trackingId, poll status)
await client.catalog.uploadProductViaFile([
  {
    /* per-category attributes */
  },
]);
await client.catalog.uploadFastListing(/* ... */);
await client.catalog.checkProductStatus({ trackingIds: ['trk-1', 'trk-2'] });

// Pre-match approval (Hepsiburada matched your SKU to an existing catalog entry)
await client.catalog.approvePreMatch({
  /* ... */
});
await client.catalog.rejectPreMatch({
  /* ... */
});

// Async delete with status polling
const { trackingId } = await client.catalog.deleteByMerchantSkuList({
  merchantSkuList: ['M-1', 'M-2'],
});
await client.catalog.getDeleteProcess(trackingId);
```

### `productUpdates` — async update flow (3 methods)

```ts
const { trackingId } = await client.productUpdates.importUpdates([
  { hbSku: 'HB-1', fields: { price: 249.0 } },
]);
await client.productUpdates.getUpdateStatus(trackingId);
await client.productUpdates.getUpdateHistory('HB-1');
```

### `suppliers` — supplier offers + inventory (5 methods)

```ts
await client.suppliers.searchOpenPurchaseOrders({ pageNumber: 0, pageSize: 50 });
await client.suppliers.searchSupplierListings({ pageNumber: 0, pageSize: 50 });
await client.suppliers.searchListingUpdateRequests({ pageNumber: 0, pageSize: 50 });
await client.suppliers.getListingUpdateRequest('REQ-1');
await client.suppliers.createListingUpdateRequest({
  /* ... */
});
```

### `accounting` — record-level transactions (1 method)

```ts
await client.accounting.listTransactions({
  beginDate: '2026-01-01',
  endDate: '2026-02-01',
  offset: 0,
  limit: 100,
});
```

### `questions` — "Ask the Seller" Q&A (6 methods)

```ts
await client.questions.list({ status: 'Open', limit: 50 });
await client.questions.get('Q-1');
await client.questions.getCountByStatus();
await client.questions.answer('Q-1', { answer: 'Stokumuzda var, 2 günde teslim ediyoruz.' });
await client.questions.reject('Q-1', { reasonCode: 'inappropriate' });
await client.questions.create({
  /* rarely needed — buyer normally creates */
});
```

### `promotions` — self-service basket campaigns (9 methods)

```ts
await client.promotions.listCategories();
await client.promotions.getBudgets();
await client.promotions.getLimits();
await client.promotions.listDiscounts();
await client.promotions.getDiscount('C-1');

// Three discount types
await client.promotions.createTlDiscount({ amount: 50, minBasket: 200 /* ... */ });
await client.promotions.createPercentDiscount({ percent: 10, minBasket: 200 /* ... */ });
await client.promotions.createXyDiscount({ buyQty: 3, payQty: 2 /* ... */ });

await client.promotions.cancelDiscount({ campaignId: 'C-1' });
```

### `testOrders` — sandbox-only test order creation (1 method)

```ts
// SIT only — guard your code so it never runs against prod
if (env === 'sit') {
  await client.testOrders.create({
    customer: {
      /* ... */
    },
    lines: [
      /* ... */
    ],
  });
}
```

## Built-in robustness

- **Retry with exponential backoff** on 429 (respects `Retry-After`) and 5xx
- **Per-resource rate limiting** (token bucket) — defaults from 30–600 req/min depending on the surface; override per resource
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Client-side validation** — empty / >1000-item bulk uploads, required `skuList` on buybox/commissions, strict `ClaimStatus` union, every action's `claimNumber` / `packageNumber` / `trackingId` checked before the request leaves the process
- **Multi-host routing** — each resource tags its target host (`listing`, `oms`, `shipping`, `claim-stub`, `oms-stub`, `mpop`); auto-resolved per env
- **`AbortSignal` support** throughout

## Wire-shape notes

Hepsiburada doesn't ship a single uniform envelope across its surfaces. The SDK normalizes each shape but the typed output mirrors what the wire returns:

- **`{ totalCount, limit, offset, pageCount, items[] }`** — OMS list endpoints (`orders.list*`, `orders.listShippedPackages`, …)
- **`{ totalElements, totalPages, number, numberOfElements, first, last, data[] }`** — Spring-style envelope (catalog category surface)
- **`{ success, code, message, data }`** — non-paged catalog responses (e.g. `getAttributes` rejects with `success: false, code: 1003` on non-leaf categories — surfaced as `ValidationError`)
- **Raw `T[]` (no envelope)** — some surfaces (unfiltered `/packages`, `catalog.listProducts`, `shipping.getCargoFirms`, …)

Every row carries an untouched `raw: Record<string, unknown>` for fields the SDK doesn't surface — undocumented fields stay available without an SDK release.

## Casing quirks

Live verification revealed `merchantId` path-segment casing tolerance differs per host:

| Host                              | merchantid (lowercase) | merchantId (camelCase) | SDK uses  |
| --------------------------------- | :--------------------: | :--------------------: | --------- |
| `listing-external[-sit]`          |         ✓ 200          |         ✗ 400          | lowercase |
| `oms-external[-sit]`              |         ✓ 200          |         ✓ 200          | camelCase |
| `mpop[-sit]` (catalog/categories) |   n/a (query param)    |           ✓            | camelCase |
| `shipping-external[-sit]`         |          n/a           |           ✓            | camelCase |

The SDK picks the casing each host actually serves — you don't need to think about it.

## Stability

`0.x` — alpha. Surface is stable; the only changes between minor versions are new resources or stricter types backed by live observation.

- **`0.5.0`** (Phase 2c) — ergonomics + strict types: `ClaimStatus` union, `skuList` required, per-host path casing
- **`0.4.0`** (Phase 2b) — full dev-portal coverage: +5 resources, +56 methods
- **`0.3.0`** (Phase 2a) — discovery-first: `orders`, `categories`, `catalog`
- **`0.2.0`** (Phase 1b) — `shipping`, `claims`, `testOrders`
- **`0.1.0`** (Phase 1a) — `listings`

## License

MIT
