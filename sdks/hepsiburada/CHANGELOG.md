# @lonca/hepsiburada

## 0.11.0

### Minor Changes

- [#85](https://github.com/loncadev/lonca/pull/85) [`2f80d30`](https://github.com/loncadev/lonca/commit/2f80d30e49ef3524d26c84a8ace7217c40db748b) Thanks [@keparlak](https://github.com/keparlak)! - Fix `catalog.listProducts` / `listProductsByStatus` silently returning `[]`, and
  surface typed product content on `CatalogProduct`.

  **Fix (data loss):** Hepsiburada's catalog list endpoints return a paginated
  envelope (`{ totalElements, totalPages, data: [...] }`), but the SDK assumed a
  bare array and dropped every row when the response was an object — so these calls
  returned nothing against the live API. They now unwrap the envelope (`data`, with
  `content` / `items` / bare-array fallbacks). Verified against live prod
  `all-products-of-merchant`.

  **Content typing:** `CatalogProduct` now exposes `title`, `categoryId`,
  `categoryName`, `brand`, `description`, and `images`, resolved best-effort from the
  row (Hepsiburada keys the title as `productName`/`name`) — so callers stop
  hand-parsing the raw row. Fields stay `undefined` when the catalog doesn't surface
  them (never guessed); `fields` and `raw` are untouched.

  ```ts
  const products = await client.catalog.listProducts(); // now returns rows (was [])
  products[0]?.title; // string | undefined
  products[0]?.categoryName; // string | undefined
  products[0]?.images; // string[] | undefined
  ```

- [#85](https://github.com/loncadev/lonca/pull/85) [`2f80d30`](https://github.com/loncadev/lonca/commit/2f80d30e49ef3524d26c84a8ace7217c40db748b) Thanks [@keparlak](https://github.com/keparlak)! - Fix three read endpoints that silently returned empty results, found by
  verifying every GET endpoint against the live API.
  - **`shipping.getCargoFirms` / `shipping.listProfiles`** returned `[]` because
    Hepsiburada wraps the rows under endpoint-specific keys (`cargoFirms`,
    `profiles`) that the SDK didn't unwrap. They now resolve those keys (live: 5
    cargo firms / 9 profiles, previously 0).
  - **`categories.getAttributes`** returned `[]` because the response nests
    attributes in `data` under three buckets (`baseAttributes`, `attributes`,
    `variantAttributes`) rather than a bare array. They're now flattened into one
    `CategoryAttribute[]`, each tagged with a new `group` field
    (`'base' | 'category' | 'variant'`). Live: 38 attributes, previously 0.
  - **`claims.list` / `claims.listByStatus`** failed with `400 "LimitCannotBeEmpty"`
    when called without pagination. `offset`/`limit` now default to `0`/`100`
    (override via params), so `claims.list()` works out of the box.

## 0.10.0

### Minor Changes

- [#80](https://github.com/loncadev/lonca/pull/80) [`0c2cf47`](https://github.com/loncadev/lonca/commit/0c2cf47412cf71474faf2b56445c136d5a9d0ed8) Thanks [@keparlak](https://github.com/keparlak)! - Re-export the `@lonca/core` pagination helpers from each SDK.

  `paginate`, `paginateOffset`, and the `CursorPage` / `OffsetPage` (and their
  param) types are now re-exported from `@lonca/trendyol` and `@lonca/hepsiburada`,
  so consumers can iterate list endpoints without taking a separate direct
  dependency on `@lonca/core`:

  ```ts
  import { paginate } from '@lonca/trendyol';
  for await (const pkg of paginate((cursor) => client.orders.list({ cursor }))) {
    /* … */
  }
  ```

## 0.9.3

### Patch Changes

- Updated dependencies [[`c80e1f7`](https://github.com/loncadev/lonca/commit/c80e1f7430f5919570b9642300fe89ec82294d94)]:
  - @lonca/core@0.6.0

## 0.9.2

### Patch Changes

- [#76](https://github.com/loncadev/lonca/pull/76) [`8ae5960`](https://github.com/loncadev/lonca/commit/8ae59608ea3c90cf435f1c1e6cee43cb428948e1) Thanks [@keparlak](https://github.com/keparlak)! - Resolve the remaining review findings: money rounding, error redaction, and a typed capabilities contract.
  - **`moneyFromMajor` rounds in decimal space.** It now scales via the number's
    string form (`"1.255e2"` → exactly `125.5`) instead of `major * 10 ** scale`,
    which first produces a binary-rounded product like `125.49999999999999`. So
    `moneyFromMajor(1.255, TRY)` is now `126` (was `125`) and `1.005` is `101`
    (was `100`), matching the decimal you actually wrote. Non-finite inputs now
    throw a `TypeError` instead of silently producing `NaN`.
  - **Shared capabilities contract.** New `@lonca/core` export
    `MarketplaceCapabilities`; each SDK's `*Capabilities` constant now `satisfies`
    it (kept `as const`), so the cross-marketplace key set can't drift — a
    renamed or missing flag is a compile error instead of a silent `undefined`.
  - **Hepsiburada 403 no longer leaks the raw server body.** `mapHttpError` gives
    `403` a fixed, safe message (`"Hepsiburada forbidden (check credentials,
permissions, or User-Agent header)"`) instead of echoing the server's
    message, which can carry request context; the raw body stays on
    `error.data` / `cause` for debugging.

- Updated dependencies [[`8ae5960`](https://github.com/loncadev/lonca/commit/8ae59608ea3c90cf435f1c1e6cee43cb428948e1)]:
  - @lonca/core@0.5.0

## 0.9.1

### Patch Changes

- [#74](https://github.com/loncadev/lonca/pull/74) [`3da755d`](https://github.com/loncadev/lonca/commit/3da755da6980d596dd8b5835f61a9f69b23814e0) Thanks [@keparlak](https://github.com/keparlak)! - Harden retry, backoff, and pagination against duplicate writes and retry storms.
  - **Retries no longer replay non-idempotent writes on ambiguous failures.** A
    timed-out, 5xx, or network-failed `POST`/`PUT`/`DELETE`/`PATCH` may already
    have committed server-side, so it is no longer auto-retried (which could
    duplicate an order split, cancel, or price/stock push). Only `429` — which the
    server provably rejected before processing — is replayed for writes; `GET`
    still retries normally. Pass `idempotent: true` on a request to opt a write
    back into full retries when it carries an idempotency key. New `@lonca/core`
    export: `isRetryableIdempotentOnly`.
  - **`Retry-After` parsing is unified and fixed.** A `Retry-After: 0` (or blank /
    past-date) header no longer collapses exponential backoff to a zero-delay
    retry storm. The parser now lives in `@lonca/core` (new export
    `parseRetryAfter`) and is shared by both SDKs, ending the Trendyol/Hepsiburada
    drift; `retry()` also defensively ignores a non-positive `retryAfterMs`.
  - **Trendyol `orders.list()` no longer throws mid-pagination at the 10k cap.**
    When the next page would exceed the 10,000-record offset cap, `nextCursor` is
    withheld so `paginate()` ends cleanly instead of handing back a cursor that
    then throws a `ValidationError`. Use `listStream()` for full scans.
  - **Shared transport lifecycle.** The request loop (rate-limit, fetch under a
    composed timeout, FormData/JSON body, 204 handling, error mapping, retry, and
    logging) is now a single `createRequester` factory in `@lonca/core`, with each
    SDK injecting only its marketplace-specific seams (URL building, headers,
    status→error mapping). This removes ~150 duplicated lines per SDK and the
    drift between them; as a side effect the Hepsiburada transport regains
    per-request `headers` support. New `@lonca/core` exports: `createRequester`,
    `BaseRequestOptions`, `RequesterConfig`.

- Updated dependencies [[`3da755d`](https://github.com/loncadev/lonca/commit/3da755da6980d596dd8b5835f61a9f69b23814e0)]:
  - @lonca/core@0.4.0

## 0.9.0

### Minor Changes

- [#68](https://github.com/loncadev/lonca/pull/68) [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe) Thanks [@keparlak](https://github.com/keparlak)! - feat: pagination consistency, status map, normalized error issues, typed fields, capabilities, and a test double
  - **breaking:** `listings.list()` now returns a core `OffsetPage<Listing>` (`.items` + `.pageCount`) instead of `{ listings, totalCount, limit, offset }`, so it composes with `paginateOffset` and matches every other list endpoint. `ListingsPage` stays exported as a **deprecated** alias of `OffsetPage<Listing>` for the lifetime of the `0.x` line — update `.listings` reads to `.items`.
  - `statusMap` + `normalizeStatus` mapping known Hepsiburada order/package statuses into core's `NormalizedOrderStatus`; unknown statuses surface via `mapped: false`. Adds `KnownHepsiburadaOrderStatus`.
  - `mapHttpError` now populates `LoncaError.issues` (`field`/`code`/`message` only — never raw PII) and aligns the raw body onto `error.data` (previously only on `cause`).
  - `Order.customerName` and `Listing.updatedAt` are now surfaced (as `string | null`) from the raw row, so callers stop guessing from `raw`.
  - `hepsiburadaCapabilities` (`scheduledPricing` / `stockOnlyBatch` / `listingUpdatedAt`), also exposed as `client.capabilities`.
  - New `@lonca/hepsiburada/testing` subpath export: `createFakeHepsiburadaClient(seed?)` — the real client graph over a fake transport for unit tests.

### Patch Changes

- Updated dependencies [[`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe)]:
  - @lonca/core@0.3.0

## 0.8.0

### Minor Changes

- [#59](https://github.com/loncadev/lonca/pull/59) [`082cb9c`](https://github.com/loncadev/lonca/commit/082cb9cd1dadefb0351844ee0e2fb781d36ddaf4) Thanks [@keparlak](https://github.com/keparlak)! - feat: cross-SDK harmonization Tier 3 — `OffsetPage<T>` in core + Trendyol resource constructor refactor

  **`@lonca/core`** — adds the offset-pagination companion to `CursorPage<T>`:
  - `OffsetPage<T>` interface: `{ totalCount, limit, offset, pageCount, items[] }`.
    This is the wire shape Hepsiburada's OMS endpoints use; lives in core so future
    marketplace SDKs (n11, Amazon TR, …) can reuse it.
  - `OffsetPaginationParams`: `{ offset?, limit? }`.
  - `paginateOffset()`: async iterator helper that walks an offset-paginated
    endpoint to exhaustion (or until `maxPages`).

  **`@lonca/hepsiburada`** — internal alignment:
  - `OrdersPage<T>` is now a `@deprecated` type alias for `OffsetPage<T>` from
    core. No runtime change; existing imports keep working.

  **`@lonca/trendyol`** — resource constructor harmonization:
  - Every resource constructor is now `(transport)` or `(transport, limiter?)` —
    the previous `sellerId` positional argument is gone. Resources read
    `transport.sellerId` (new getter) instead. Before: `new OrdersResource(transport,
sellerId, limiter?)`; after: `new OrdersResource(transport, limiter?)`.
  - Affected: `categories`, `claims`, `finance`, `inventory`, `invoices`,
    `labels`, `orders`, `products`, `questions`, `suppliers`, `testOrders`,
    `webhooks` (12 resources). `brands`, `locations` already had the clean
    signature.
  - `CategoriesResource.getByBarcodes` no longer throws when the seller wasn't
    passed at construction (the optional `sellerId` constructor arg was the
    only path that allowed `sellerId === undefined`; with the new signature
    it's always present).
  - `TrendyolTransport` exposes a public `sellerId` getter for resources to
    read.

  **Breaking change**: any caller manually constructing Trendyol resources
  needs to drop the `sellerId` argument:

  ```diff
  - new OrdersResource(transport, sellerId, limiter)
  + new OrdersResource(transport, limiter)
  ```

  `createTrendyolClient` users are unaffected — the factory always built
  resources correctly.

  Verification:
  - 478 mock tests pass (41 core + 180 hepsiburada + 257 trendyol).
  - typecheck + build green on all 3 packages.
  - 1 dead test removed in `categories.test.ts` (the "throws when constructed
    without sellerId" path was no longer reachable).

### Patch Changes

- Updated dependencies [[`082cb9c`](https://github.com/loncadev/lonca/commit/082cb9cd1dadefb0351844ee0e2fb781d36ddaf4)]:
  - @lonca/core@0.2.0

## 0.7.0

### Minor Changes

- [#57](https://github.com/loncadev/lonca/pull/57) [`bfb18b5`](https://github.com/loncadev/lonca/commit/bfb18b56f4e38c7593e0f0184779d327b80e67dc) Thanks [@keparlak](https://github.com/keparlak)! - feat: cross-SDK harmonization (Tier 1 + 2 + 4 of consistency audit)

  After a side-by-side consistency audit between the two SDKs, this release
  unifies the small-but-pervasive surface differences. No new resources,
  no new endpoints — just less surprise for callers using both SDKs.

  **Tier 1 — DX wins (breaking type changes)**
  - `@lonca/trendyol`: `integratorName` is now **required** on
    `CreateClientOptions` and the transport's `TransportConfig` (was
    optional, defaulted to `'SelfIntegration'`). Trendyol uses this to
    attribute API traffic — making it explicit prevents accidentally
    shipping `'SelfIntegration'` to production. `buildUserAgent(sellerId,
integratorName)` also drops its default.
  - `@lonca/hepsiburada`: transport adds per-request **correlation ID** —
    a UUID generated per call, included as `x-correlationid` request
    header, and surfaced in every `logger.debug` / `logger.warn` line.
    Mirrors what Trendyol's transport has done from day one; enables
    cross-marketplace log correlation.

  **Tier 2 — Export hygiene (Hepsiburada)**
  - `parseWebhookEvent` is the new canonical entry point — same function
    reference as `parseHepsiburadaWebhookEvent`, just a shorter name that
    matches `@lonca/trendyol`'s export. The old name stays exported as a
    `@deprecated` alias for one minor; remove in the following release.
  - `HepsiburadaTransport`, `RequestOptions`, `TransportConfig`, and
    `HepsiburadaService` are **no longer exported** from the package
    index. They were internal implementation surface; keeping them
    exported was an oversight that forced any internal refactor to be
    breaking. `HepsiburadaEnvironment` remains exported (it's a
    config-relevant type users may want to type their own env switches
    with).

  **Tier 4 — Documentation**
  - Both READMEs gain a "Rate-limiter defaults" table listing per-resource
    capacity and interval so users don't have to read the source to know
    the budget.
  - Both READMEs document the per-request correlation ID feature.

  Verification: 438 mock tests pass across both packages (180 Hepsiburada
  - 258 Trendyol); typecheck + build green on both.

## 0.6.0

### Minor Changes

- [#51](https://github.com/loncadev/lonca/pull/51) [`1efd1c5`](https://github.com/loncadev/lonca/commit/1efd1c50fdf0d044b11e264b7e178989fe9f40a3) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2d — webhook event parser + casing regression tests + live smoke script

  No new resources or endpoints. Three quality-of-life additions on top of
  the 0.5.0 surface:

  **Webhook event helper** (`parseHepsiburadaWebhookEvent`)

  Hepsiburada uses endpoint-per-event webhooks (different from Trendyol's
  body-discriminated single-endpoint model). The SDK now ships:
  - `parseHepsiburadaWebhookEvent(event, rawBody)` — validates the event
    name + JSON body, throws `ValidationError` on bad input, returns a
    typed `{ event, body, raw }` envelope.
  - `OrderWebhookEvent` / `ClaimWebhookEvent` / `HepsiburadaWebhookEvent`
    union types for compile-time switch exhaustiveness.
  - `ORDER_WEBHOOK_EVENTS` / `CLAIM_WEBHOOK_EVENTS` /
    `HEPSIBURADA_WEBHOOK_EVENTS` runtime arrays for route registration.

  Covers all 12 documented events: 8 order events (`createOrder`,
  `createPackages`, `orderCancel`, `unpack`, `intransit`, `deliver`,
  `undeliver`, `changeShippingAddressOrder`) and 4 claim events
  (`awaitingAction`, `awaitingPreApproval`, `disputedClaimResult`,
  `packageFromClaimResult`). Per-event body shapes are typed as
  `Record<string, unknown>` — Hepsiburada documents fields in HTML tables;
  the SDK keeps body loose and exposes the raw payload via `.raw`.

  **Casing regression tests**

  The Phase 2c discovery that listing-external is case-sensitive while
  oms-external is case-insensitive lives in `__tests__/casing-regression.ts`
  now. The tests pin the exact path string each resource emits so a future
  refactor can't unintentionally flip casing back and silently break a
  production integration.

  **Live smoke script** (`examples/try-hepsiburada.mts`)

  Read-only walkthrough that hits one endpoint per resource against the
  configured `HB_ENV` (default `sit`). Reports `✓ 200`, `🔒 401/403` (path
  recognized, scope missing — production should work), and `✖ unexpected`
  per call. Mirrors the existing `pnpm try:trendyol` flow.

  Wire up: `pnpm try:hepsiburada` + new `@lonca/hepsiburada` workspace dep
  in `@lonca/examples`.

  Verification:
  - 180 mock tests pass (36 new: 22 webhook + 14 casing regression).
  - typecheck + ESM/CJS/DTS build + prettier all green.
  - Live SIT smoke run against sandbox merchant returns expected
    shape (200 for in-scope endpoints, 401 for out-of-scope, no behaviour
    regressions vs 0.5.0).

## 0.5.0

### Minor Changes

- [#48](https://github.com/loncadev/lonca/pull/48) [`b8613c9`](https://github.com/loncadev/lonca/commit/b8613c9408d61c85581fe0d9456fc86d579e5119) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2c — ergonomics + strict types (live-SIT verified)

  Three targeted hardening fixes after exhaustive live-SIT verification of
  every read endpoint on the SDK. No new resources or methods — Phase 2c
  tightens contracts and corrects path casing per spec.

  **Breaking type changes** (runtime behavior preserved for valid inputs):
  - **`listings.getBuyboxOrder(skuList)` / `getCommissions(skuList)`** — the
    `skuList` parameter is now **required** (was `string | undefined`). The
    published OpenAPI spec marks it optional, but the live API rejects empty
    with `400 "skuList cannot be empty"`. The SDK now validates client-side
    and throws `ValidationError` with a clear message before the request
    leaves the process. Callers passing an empty / undefined `skuList` were
    always silently getting `400` from Hepsiburada; they now get a typed
    error at call time.
  - **`claims.listByStatus(status, ...)`** — `status` is now typed as
    `ClaimStatus`:
    ```ts
    type ClaimStatus =
      | 'NewRequest'
      | 'Accepted'
      | 'AwaitingAction'
      | 'InDispute'
      | 'Rejected'
      | 'Refunded'
      | 'Cancelled'
      | 'AwaitingPreApproval'
      | (string & {});
    ```
    Trendyol's `'Open'` / `'Closed'` naming does NOT apply to Hepsiburada;
    the live API rejects everything outside the published enum with
    `400 "Wrong Claim Status"`. The trailing `(string & {})` keeps the
    union forward-compatible if Hepsiburada adds a new status without an
    SDK release, while still giving intellisense for the documented set.

  **Path casing alignment** (no behavior change):
  - `orders` (28 methods), `claims` (already correct), `accounting`
    (1 method): all `/merchantid/{id}` segments updated to `/merchantId/{id}`
    per the published spec. Verified live: `oms-external-sit` accepts both
    casings and returns identical results.
  - `listings` (18 methods): path stays at `/merchantid/{id}` (lowercase).
    Live verification revealed `listing-external-sit` is **case-sensitive**
    and returns `400 Bad Request` for the camelCase variant. The lowercase
    form is what the host actually serves.

  The casing rationale is now documented per-resource in JSDoc.

  Live SIT verification:
  - 144 mock tests pass; typecheck + build green.
  - `listings.list` → 89 listings (lowercase, unchanged).
  - `orders.list` / `listMissingInvoicePackages` → 161 packages (camelCase
    works).
  - `claims.listByStatus('AwaitingAction')` → 2 claims (strict union accepted).
  - `listings.getBuyboxOrder('')` / `getCommissions('')` → `ValidationError`
    at call time (no network round-trip).

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
