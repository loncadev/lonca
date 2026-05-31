# @lonca/hepsiburada

## 0.4.0

### Minor Changes

- [#46](https://github.com/loncadev/lonca/pull/46) [`55c339f`](https://github.com/loncadev/lonca/commit/55c339f9b18c0525650ac95c9ebca80a992727d5) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2b — full developer-portal coverage (95 methods, 12 resources)

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

## 0.3.0

### Minor Changes

- [#44](https://github.com/loncadev/lonca/pull/44) [`94c8144`](https://github.com/loncadev/lonca/commit/94c81440b22d2f7ef50024cc54c72be1dbfad19e) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2a — orders, categories, catalog products (5 endpoints, 3 resources) + critical User-Agent fix

  **Critical fix**: prior versions (0.1.0 / 0.2.0) sent
  `User-Agent: {merchantId} - {integratorName}` which Hepsiburada SIT rejects with
  401/403 across listings / OMS / mpop. The SDK now sends the bare
  `integratorName` (e.g. `beekod_dev`) — what merchants configure server-side.
  Live-verified against SIT for all 7 resources (listings, shipping, claims,
  testOrders, orders, categories, catalog). **Upgrade required for working
  production calls.**

  New discovery-first resources (no upstream OpenAPI — shapes derived from live
  SIT probing):
  - **`orders`** (2 methods, `oms-external`):
    - `list({status?, beginDate?, endDate?, offset?, limit?})` — wrapped
      `{ totalCount, limit, offset, pageCount, items[] }`
    - `listPackages({...})` — raw array of shipping packages
  - **`categories`** (2 methods, `mpop` umbrella):
    - `list({page?, size?, leaf?})` — Spring-style envelope
      `{ totalElements, totalPages, data[] }`; ~27k categories total
    - `getAttributes(categoryId)` — **leaf-only**; non-leaf categories throw
      `ValidationError` with Hepsiburada code `1003`
  - **`catalog`** (1 method, `mpop` umbrella):
    - `listProducts({page?, size?})` — merchant catalog rows with per-field
      revision history, validation state, matching state, product-quality score

  Adds a new `mpop` service to the transport's base-URL table
  (`mpop[-sit].hepsiburada.com`) for the catalog / category surfaces. Resources
  already on `oms-external` (claims) now share that host with `orders`.

  **Total Hepsiburada coverage: 34 endpoints / 7 resources** — 8 of 20 API
  products covered. Remaining doc-only surfaces (suppliers, finance / settlements,
  e-invoice, tickets, notifications, questions, promotions) need either upstream
  OpenAPI publication or merchant-portal endpoint hints for Phase 2b.

## 0.2.0

### Minor Changes

- [#42](https://github.com/loncadev/lonca/pull/42) [`497da84`](https://github.com/loncadev/lonca/commit/497da841ec180374e36e2095b4f3ac6aab56c099) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 1b — shipping, claims, test orders (11 endpoints, 3 resources)

  Adds the remaining four OpenAPI-spec-backed Hepsiburada surfaces, completing
  coverage of every spec-backed product on developers.hepsiburada.com (5 of 20):
  - **`shipping`** (4 methods) — `shipping-entegrasyonu`: `getCargoFirms()`,
    `listProfiles()`, `createProfile()`, `updateProfile()`. Service base:
    `shipping-external[-sit].hepsiburada.com`.
  - **`claims`** (6 methods) — `talep-listeleme` + `talep-olusturma`:
    `list()`, `listByStatus()`, `accept()`, `reject()`, `preApprovalConfirm()`,
    `create()`. Dual-service routing: list / status / actions on
    `oms-external[-sit]`, create on `claim-stub-external[-sit]`.
  - **`testOrders`** (1 method, SIT sandbox only) — `test-siparisi-olusturma`:
    `create()` on `oms-stub-external[-sit]`.

  The shipping / talep-\* OpenAPI specs are skeletal (paths only, body schemas
  empty). Path params + known query params are typed strictly; bodies accept
  `Record<string, unknown>` with portal-doc references in JSDoc.

  Total coverage now: 29 endpoints across 4 resources (listings, shipping,
  claims, testOrders) — every Hepsiburada API surface that ships with a
  machine-readable OpenAPI spec.

## 0.1.0

### Minor Changes

- [#40](https://github.com/loncadev/lonca/pull/40) [`ded94fa`](https://github.com/loncadev/lonca/commit/ded94fa2a3c879cdd74bb1cc46650f7199bfaab6) Thanks [@keparlak](https://github.com/keparlak)! - Initial release — `@lonca/hepsiburada` 0.1.0 with **Listings (Phase 1a)** surface.

  ### What's in 0.1.0

  New top-level package + `createHepsiburadaClient({ merchantId, username, password, env, integratorName })` factory. Multi-service base URL resolution: each resource tags which Hepsiburada service it talks to (`listing` / `oms` / `shipping` / `claim-stub` / `oms-stub`), and the transport picks the matching `*-external[-sit]` hostname per environment.

  `client.listings` — 18 typed endpoints from the official OpenAPI spec at `developers.hepsiburada.com/api/v1/public/docs/hepsiburada/listeleme/v1/openapi`:

  | Method                                                           | Path                                                  |
  | ---------------------------------------------------------------- | ----------------------------------------------------- |
  | `list({offset, limit, ...})`                                     | `GET /listings/merchantid/{id}`                       |
  | `getBuyboxOrder(skuList?)`                                       | `GET /buybox-orders/merchantid/{id}`                  |
  | `getCommissions(skuList?)`                                       | `GET /commissions/merchantid/{id}`                    |
  | `activate(hbSku)` / `deactivate(hbSku)`                          | `POST /listings/.../sku/{sku}/{activate\|deactivate}` |
  | `updateSingle(hbSku, mSku, {...})`                               | `POST /listings/.../sku/{sku}/merchantsku/{mSku}`     |
  | `deleteSingle(hbSku, mSku)`                                      | `DELETE /listings/.../sku/{sku}/merchantsku/{mSku}`   |
  | `bulkUnlock({hbSkuList})`                                        | `POST /listings/.../bulk-unlock`                      |
  | `uploadInventory/Stock/Price/ShippingInfo/AdditionalInfo(items)` | `POST /listings/.../{kind}-uploads`                   |
  | `getInventoryUpload/StockUpload/...`                             | `GET /listings/.../{kind}-uploads/id/{id}`            |

  All five bulk uploads return `{ id }` synchronously; poll the matching `get*Upload(id)` to read the outcome (status + per-row errors + price validations for price uploads). Hepsiburada retains upload results for 24+ hours.

  ### Robustness
  - Retry with exponential backoff on 429 (`Retry-After` honored) and 5xx
  - Per-resource `TokenBucketRateLimiter` (default 600 req/min on listings — Hepsiburada doesn't publish per-endpoint limits)
  - Structured errors via `@lonca/core` — auth/rate-limit/not-found/validation/server/network/timeout
  - Client-side validation: empty / >1000-item bulk uploads, `list({offset≥0, limit≥1})`, empty `bulkUnlock` — all throw `ValidationError` before hitting the wire
  - `User-Agent` built automatically as `{merchantId} - {integratorName}` (Hepsiburada rejects requests without one)
  - `AbortSignal` support throughout

  ### Test coverage

  41/41 mock tests pin the documented paths, query keys (hyphenated `salable-listings`/`notsalable-listings`), raw-array body envelopes (Hepsiburada uses bare arrays for bulk uploads, not `{items:[...]}`), error normalization, and every `ValidationError` edge.

  ### Not in 0.1.0 (gaps)

  Only 5 of Hepsiburada's 20 published API products have machine-readable OpenAPI specs today. The other 15 (catalog + product creation/update, orders, fulfilment, suppliers, e-invoice, tickets, etc.) are doc-only on the developer portal. Plan:
  - **0.2.0 — Phase 1b** — Shipping (4 endpoints), Claims read+create (6), Test-order utility (1) → small additions, all spec-backed
  - **0.3.0+** — Catalog / product / order / supplier surfaces, which need either Hepsiburada to publish the missing specs or sandbox credentials for discovery-first probing (the same wire-verify pattern that built `@lonca/trendyol`)

  See [`sdks/hepsiburada/README.md`](./sdks/hepsiburada/README.md) for the full surface + an end-to-end bulk-price-update walkthrough.
