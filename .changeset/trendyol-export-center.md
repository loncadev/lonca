---
'@lonca/trendyol': minor
---

feat(trendyol): Export Center (İhracat Merkezi / AutoFT) — 12 endpoints, new `exportCenter` resource

Adds full coverage of Trendyol's Export Center program — Türkiye-based
sellers shipping to Trendyol's international platforms. The Export Center
shares the same `apigw.trendyol.com` gateway and HMAC auth as the main
marketplace; the distinguishing factor is the `/integration/ecgw/v{N}/{sellerId}/…`
path prefix.

Previously the SDK only exposed `categories.getByBarcodes` (which routes
through the Export Center barcode-lookup endpoint). This release adds 12
more Export Center endpoints under a dedicated `exportCenter` resource.

New `exportCenter` resource (12 methods):

- **Products** (4)
  - `listProducts({ barcodes?, pageKey?, size? })` — `GET /v2/{id}/products`
  - `createProducts(items)` — `POST /v2/{id}/products` (max 5000)
  - `updatePrices(priceInfos)` — `POST /v1/{id}/prices` (max 5000; 1 update / barcode / day)
  - `updateStocks(items)` — `POST /v1/{id}/stocks` (max 5000)
- **Batch status** (1)
  - `getBatchStatus(batchId)` — `GET /v1/{id}/check-status?batchId=…` (24-hour retention)
- **Packages** (3)
  - `listPackagesV2({ status?, trackingNumber?, dates?, size?, boutiqueId? })`
  - `listPackagesV3({ status?, offset?, limit?, dates? })`
  - `getPackageItems({ packageId, status?, offset?, limit? })`
- **Lookup** (4)
  - `getCategoryAttributes(categoryId)`
  - `getCareInstructions()` — values used by `createProducts`
  - `getCompositions()` — material compositions for `createProducts`
  - `getOrigins()` — country-of-origin values for `createProducts`

Plus a corrected note in the README: V1 endpoint sunset (previously
flagged for August 2026) is N/A — Trendyol's V2 docs reuse the V1 paths,
and the SDK already emits the V2 response shape (`nextPageToken`
pagination, content-based variants).

Body / response shapes are typed loosely (`Record<string, unknown>` per
the developer-portal HTML-table docs) with `raw` accessors on every row
for forward-compat field access. Per-endpoint limits and constraints are
documented in JSDoc.

Verification:
- 283 mock tests pass (26 new in `export-center.test.ts`)
- typecheck + ESM/CJS/DTS build green
