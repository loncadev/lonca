---
'@lonca/hepsiburada': minor
---

feat(hepsiburada): Phase 2b — full developer-portal coverage (95 methods, 12 resources)

Closes EVERY operation documented on developers.hepsiburada.com. Discovery
methodology: the dev portal SPA exposes a hidden
`/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` API that returns
full OpenAPI-shape detail (method, path, parameters, requestBody, responses,
examples) for every documented operation — even when a product's `versions`
endpoint reports as empty. Phase 2b enumerates all 67 doc-only operations
across the 12 products that ship documented API surfaces and merges them
with the 29 spec-backed + 5 Phase 2a discovery endpoints already in the
SDK. Total: **95 unique methods across 12 resources** (after dedup).

Extensions to existing resources:
- **`orders`** (2 → 28 methods): full `siparis-olusturma-entegrasyonu` surface —
  status-bucketed lists (cancelled / paymentAwaiting / shipped / delivered /
  undelivered / unpacked / missing-invoice), single-resource fetches
  (`getByOrderNumber`, `getPackage`, `getPackageLabel`), package mutations
  (`createPackages`, `splitPackage`, `unpackPackage`), status transitions
  (`markPackageInTransit` / `markPackageDelivered` / `markPackageUndelivered`),
  line-item actions (`cancelLineItem`, `updateLineItemCargoCompany`,
  `updateLineItemLaborCost`), package field updates
  (`updatePackageCargoCompany`, `sendInvoiceLink`, `updateParcelInfo`,
  `updatePackageWarehouse`), and cargo-company-change discovery
  (`getChangeableCargoCompaniesForLineItem` / `…ForPackage`,
  `getPackageableLineItems`).
- **`catalog`** (1 → 11 methods): full `katalog-urun-entegrasyonu` product
  surface — `listProducts` / `listProductsByStatus`,
  `getProductStatus(trackingId)`, `getTrackingIdHistory`,
  `uploadProductViaFile`, `uploadFastListing`, `approvePreMatch` /
  `rejectPreMatch`, `checkProductStatus`, `deleteByMerchantSkuList` /
  `getDeleteProcess(trackingId)`.
- **`categories`** (2 → 3 methods): adds `getAttributeValues(categoryId,
  attributeId)` for enum-style attributes.

New resources:
- **`productUpdates`** (3 methods, oms-external) —
  `urun-guncelleme-entegrasyonu`: `importUpdates`, `getUpdateStatus`,
  `getUpdateHistory(hbSku)`.
- **`suppliers`** (5 methods, oms-external) — `tedarikci-entegrasyonu`:
  `searchOpenPurchaseOrders`, `searchSupplierListings`,
  `searchListingUpdateRequests`, `getListingUpdateRequest`,
  `createListingUpdateRequest`.
- **`accounting`** (1 method, oms-external) — `muhasebe-entegrasyonu`:
  `listTransactions`. The product's other documented endpoint ("Performans
  Servisi") is the same `/orders/merchantid/{id}` already exposed by
  `orders.list()`.
- **`questions`** (6 methods, oms-external) — `saticiya-sor-entegrasyonu`:
  `list`, `get`, `getCountByStatus`, `create`, `answer`, `reject`.
- **`promotions`** (9 methods, oms-external) —
  `satici-promosyonu-entegrasyonu`: `listCategories`, `getBudgets`,
  `getLimits`, `listDiscounts`, `getDiscount`, `createTlDiscount`,
  `createPercentDiscount`, `createXyDiscount`, `cancelDiscount`.

Phase 2a path correction:
- `catalog.listProducts` now correctly hits
  `/product/api/products/all-products-of-merchant/{merchantId}` (the
  doc-published path). The Phase 2a fallback `?merchantId=` query path was
  a shortcut that no longer matches the production spec.

Live verification (SIT, beekod_dev):
- All Phase 2b orders extensions return `200` end-to-end (e.g.
  `listMissingInvoicePackages` → 161 packages in sandbox).
- Catalog fixed path returns `200` (empty in sandbox, full shape verified).
- `productUpdates` / `suppliers` / `questions` / `promotions` return `401`
  in sandbox (gateway recognizes path, beekod_dev lacks scope) — paths are
  typed from the dev-portal spec; integrators with the right production
  scope can call them as-is.
- `accounting.listTransactions` returns `404` in sandbox — host placement
  presumed `oms-external`; typed from spec, integrator's host may differ.

Verification:
- 144 mock tests pass (78 new in `phase-2b.test.ts`, plus Phase 2a tests
  updated for the catalog path fix).
- `pnpm typecheck` + `pnpm build` green.
- Live SIT smoke covers every endpoint reachable with the sandbox merchant's
  scope.

Coverage: 13 of 20 Hepsiburada dev-portal products now covered (the other
7 are pure documentation pages or empty placeholders on the portal).
