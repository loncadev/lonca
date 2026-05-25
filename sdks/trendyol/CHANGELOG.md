# @lonca/trendyol

## 0.2.0

### Minor Changes

- [`5180842`](https://github.com/loncadev/lonca/commit/51808429841d1ef5610a6fa71354ac5fddd7bdce) Thanks [@keparlak](https://github.com/keparlak)! - Add `categories` resource — required for product creation.
  - `client.categories.list()` — fetch the full Trendyol category tree (no pagination; returned in one response)
  - `client.categories.getAttributes(categoryId)` — fetch required and optional attributes for a category, including variant / slicer flags and allowed values

  New exported types: `Category`, `CategoryAttribute`, `CategoryAttributeValue`. IDs are normalized to strings per `@lonca/core` convention.

  Rate-limited to 50 req/min (shared bucket across both endpoints, matching Trendyol's service limits).

  Bottom-up rollout: categories are a prerequisite for the upcoming products resource (`createProduct V2` requires `categoryId` + category attributes).

- [`3cc3df8`](https://github.com/loncadev/lonca/commit/3cc3df8d47ab5a59a76bc482f5b6de73f404252f) Thanks [@keparlak](https://github.com/keparlak)! - Add `inventory` resource — Trendyol stock & price update (a.k.a. `updatePriceAndInventory`).
  - `client.inventory.update(items)` → `{ batchRequestId }`
    - POSTs to `/integration/inventory/sellers/{sellerId}/products/price-and-inventory`
    - Each item: `{ barcode (required), quantity?, salePrice?, listPrice? }`
    - Max 1000 items per call, 20 000 stock per product (Trendyol-side)
    - No rate limit (per Trendyol's service-limits table)
    - Async — poll the returned `batchRequestId` with `client.products.getBatchStatus(...)`
    - Client-side validation throws `ValidationError` for empty or oversized batches before hitting the network

  Verified against Trendyol STAGE on 2026-05-25: a safe smoke test posts a unique fake barcode (`LONCA-SMOKE-<ts>`) so the call cannot match any real product; Trendyol still accepts it asynchronously and returns a real `batchRequestId`.

  New exports: `InventoryResource`, `PriceInventoryUpdate`, `UpdatePriceInventoryResponse`.

  This rounds out the bottom-up Phase 1 set:
  - brands ✓ — read brand catalog
  - categories ✓ — read category tree + attributes
  - suppliers ✓ — read return/shipment addresses
  - products ✓ — read approved products + batch status
  - **inventory ✓ — write stock & price**

  Next major group (separate release): orders + shipment packages.

- [`1f848a5`](https://github.com/loncadev/lonca/commit/1f848a5e1edd6488cc4387c1750c0ed2f880e5d7) Thanks [@keparlak](https://github.com/keparlak)! - Add `orders` resource — list shipment packages (Trendyol's `getShipmentPackages`).
  - `client.orders.list({ cursor?, limit?, status?, orderNumber?, startDate?, endDate? })` → `CursorPage<ShipmentPackage>`
    - GETs `/integration/order/sellers/{sellerId}/orders`
    - Page-based pagination internally; SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
    - Filters: `status`, `orderNumber`, date range
    - Page size capped at Trendyol's 200 max

  Discovery-first workflow: a separate `examples/inspect-orders.mts` script (`pnpm try:inspect-orders`) was used to dump the **real STAGE wire shape** _before_ writing types. The resulting types model the field set as Trendyol actually returns it (47 root-level fields on the package, nested `lines[]`, `packageHistories[]`, `invoiceAddress`, `shipmentAddress`). Wire field `3pByTrendyol` (cannot start with a digit in TypeScript identifiers) is renamed to `threePByTrendyol` on the public surface.

  New exports:
  - `OrdersResource`, `ListOrdersParams`
  - `ShipmentPackage`, `ShipmentPackageStatus`, `OrderLine`, `OrderLineDiscountDetail`, `OrderAddress`, `OrderAddressLines`, `OrderCustomer`, `PackageHistoryEntry`

  Smoke verified live on Trendyol STAGE 2026-05-25: pulled 2 packages
  (`Invoiced` 85 TRY, `Picking` 1300 TRY) with lines and customer info parsed
  correctly. Regression mock test pins the exact PROD-shape package.

  Phase 1 SDK now covers the full bottom-up chain: brands → categories → suppliers → products → inventory (write) → orders.

- [`7ed69b5`](https://github.com/loncadev/lonca/commit/7ed69b583b48fef42dc35ac32d91006bfdfcd17f) Thanks [@keparlak](https://github.com/keparlak)! - Add `products` resource — Trendyol approved-product filter + async batch status helper.
  - `client.products.list({ cursor?, limit?, barcode?, startDate?, endDate? })` → `CursorPage<Product>`
    - Reads `/integration/product/sellers/{sellerId}/products/approved`
    - Pagination uses Trendyol's `nextPageToken` (cursor mode) — required when the dataset exceeds 10 000 items, and used transparently for all responses
    - Filters: barcode, date range
    - Rate-limited to 2000 req/min
  - `client.products.getBatchStatus(batchRequestId)` → `BatchRequestResult`
    - Reads `/integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}`
    - 4-hour retention window on Trendyol's side
    - Rate-limited to 1000 req/min

  Public types: `Product`, `ProductVariant`, `ProductAttribute`, `NamedRef`, `BatchRequestResult`, `BatchRequestItemResult`, `BatchRequestStatus`, `ListProductsParams`.

  Wire shape verified against live Trendyol PROD on 2026-05-25 (see `examples/try-trendyol.mts`). The SDK surfaces stable typed fields and keeps the untouched response on `Product.raw` / `ProductVariant.raw` / `BatchRequestResult.raw` for fields not modeled yet. Notable wire facts the typed surface paves over:
  - `contentId` (not `productContentId`), nested `brand` / `category` `{id,name}` refs
  - `variants[].barcode` — root-level barcode does not exist
  - `creationDate` / `lastModifiedDate` are ms-epoch; SDK exposes ISO strings
  - `getBatchRequestResult` returns `PROCESSING` for unknown batch IDs (not 404)

- [`35e815a`](https://github.com/loncadev/lonca/commit/35e815a04d55aebbbc8370b612e478f8d9e729d8) Thanks [@keparlak](https://github.com/keparlak)! - Add `suppliers` resource for fetching the seller's registered addresses (shipment, returning, invoice, warehouse).
  - `client.suppliers.getAddresses({ forceRefresh? })` — returns the address list, served from an in-memory cache to respect Trendyol's `1 req/hour` service limit
  - `client.suppliers.invalidateCache()` — drops the cache so the next call hits the API
  - Cache TTL defaults to 1 hour; override with `new SuppliersResource(transport, sellerId, { cacheTtlMs })` when constructing manually
  - Concurrent `getAddresses()` calls are deduplicated into a single in-flight request

  Required for the upcoming products resource — `createProduct V2` needs `shipmentAddressId` and `returningAddressId`, both sourced from here.

  New exported types: `SupplierAddress`, `SupplierAddressType`, `SuppliersResourceOptions`. Trendyol's legacy `_ADDRESS` suffix is stripped from `addressType` for cleaner consumer code.

### Patch Changes

- [`44b5cac`](https://github.com/loncadev/lonca/commit/44b5cac07d609ad7a4432857e64d1e7cd5f5aa6c) Thanks [@keparlak](https://github.com/keparlak)! - Align endpoint paths and response shapes with the official Trendyol OpenAPI specs.

  **Bug fix** — `@lonca/trendyol@0.1.0` shipped with placeholder paths that did not match Trendyol's actual API. Anyone trying to use the SDK against real Trendyol would have hit `404 Not Found`. This release fixes all four implemented endpoints.

  Path corrections (verified against the OpenAPI spec embedded in each `/reference/<endpoint>.md` page and against the official Postman collection):

  | Endpoint                   | Was                                          | Now                                               |
  | -------------------------- | -------------------------------------------- | ------------------------------------------------- |
  | `brands.list`              | `/sapigw/brands`                             | `/integration/product/brands`                     |
  | `categories.list`          | `/sapigw/product-categories`                 | `/integration/product/product-categories`         |
  | `categories.getAttributes` | `/sapigw/product-categories/{id}/attributes` | `/integration/product/categories/{id}/attributes` |
  | `suppliers.getAddresses`   | `/sapigw/suppliers/{sellerId}/addresses`     | `/integration/sellers/{sellerId}/addresses`       |

  Response shape fixes:
  - `categories.list` now parses the root-level JSON array (Trendyol does not wrap it in `{ categories: [...] }`)
  - `categories.getAttributes` pipes through the V2-only `allowMultipleAttributeValues` flag (added as an optional field on `CategoryAttribute`)

  Public TypeScript surface and runtime behavior remain otherwise unchanged.

- [`caac4ba`](https://github.com/loncadev/lonca/commit/caac4ba6c3cd9d3db85d35785fc6f298435a4a5d) Thanks [@keparlak](https://github.com/keparlak)! - Fix `categories.getAttributes` parsing against the real Trendyol response shape (verified against STAGE + PROD on 2026-05-25).

  The OpenAPI spec advertised an `attributeValues: [...]` field per attribute, but Trendyol's live `getCategoryAttributes` endpoint omits it for most attributes — the endpoint returns attribute metadata and flags only, not the value catalog. Without this fix, calling `getAttributes` against any real category would throw `TypeError: Cannot read properties of undefined (reading 'map')`.

  Changes:
  - `CategoryAttribute.values` is still typed as `CategoryAttributeValue[]`, but the resource now defaults to `[]` when the field is absent. JSDoc explains where to look for the actual value catalog when needed.
  - New optional `CategoryAttribute.categoryId` field — Trendyol echoes this back per attribute and it's useful for grouping.
  - Defensive normalization handles missing `attribute`, missing flags (default `false`), and missing `attributeValues`.
  - Categories list response handles both root-array and `{ categories: [...] }` wrapped shapes (different envs/seller setups behave differently).
  - New regression mock test pinned to the exact wire format we observed in PROD.

  Also documents in `brands.ts` that Trendyol enforces a **minimum 1000 page size** server-side regardless of the `limit` value passed.

## 0.1.0

### Minor Changes

- [`13931d2`](https://github.com/loncadev/lonca/commit/13931d2f634eafbec6c0cbca9761747d86ecccd7) Thanks [@keparlak](https://github.com/keparlak)! - Initial release of `@lonca/trendyol` — type-safe SDK for the Trendyol Marketplace API.

  This first scaffold proves the transport spine end-to-end. Subsequent releases will fill in the orders, products, inventory, and webhook resources.
  - `createTrendyolClient({ sellerId, apiKey, apiSecret, env, integratorName?, clientIp?, logger?, timeoutMs? })` factory
  - `client.brands.list()` — first endpoint, paginated via `@lonca/core` `CursorPage`, rate-limited to Trendyol's 50 req/min
  - Transport layer with:
    - All 5 required Trendyol headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`)
    - Per-request UUID correlation IDs
    - Exponential backoff retry on 429 / 5xx (honors `Retry-After`)
    - Per-endpoint token-bucket rate limiting
    - `AbortSignal` + request timeout (default 30s)
  - HTTP error mapping to `@lonca/core` error hierarchy (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
  - Dual ESM + CJS build via tsup, 35 vitest tests covering auth/errors/transport/brands
