# @lonca/core

## 0.3.0

### Minor Changes

- [#68](https://github.com/loncadev/lonca/pull/68) [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe) Thanks [@keparlak](https://github.com/keparlak)! - feat: error + status-normalization primitives for marketplace SDKs (additive)
  - `LoncaError.issues: LoncaErrorIssue[]` — a normalized, field-level error detail array (always present, defaults to `[]`). Each SDK maps its raw error body into it so consumers stop sniffing marketplace-specific JSON shapes.
  - `NormalizedOrderStatus` — a closed, cross-marketplace order-status vocabulary, plus `createStatusNormalizer(map)`, which folds a raw status into the vocab and surfaces unmapped values via `{ mapped: false }` instead of silently defaulting.
  - docs: `moneyFromMajor` / `moneyToMajor` now carry TRY lira↔kuruş `@example`s, and the README points marketplace prices at `moneyFromMajor(price, TRY)` instead of a hand-rolled `Math.round(x * 100)`.

## 0.2.0

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

## 0.1.0

### Minor Changes

- [`027a090`](https://github.com/loncadev/lonca/commit/027a090a136e8051f5431e672ed8456068fc8e9e) Thanks [@keparlak](https://github.com/keparlak)! - Initial release of `@lonca/core` — shared primitives for every Lonca marketplace SDK.
  - `Money` and `Currency` with integer minor-unit representation (ISO 4217)
  - `CursorPage` and `paginate()` async iterator helper
  - `LoncaError` hierarchy: `AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, `ServerError`, `NetworkError`, `TimeoutError` (each tagged with `code` and `retryable`)
  - `retry()` helper with exponential backoff, jitter, `retryAfterMs` support, and `AbortSignal` cancellation
  - `Logger` interface with `noopLogger` and a JSON-line `consoleLogger`
  - `TokenBucketRateLimiter` with async `acquire()` and `AbortSignal` support

- [`499d404`](https://github.com/loncadev/lonca/commit/499d40419b81999a0ef997387278add9427386d8) Thanks [@keparlak](https://github.com/keparlak)! - Bump minimum Node.js to `>=22` (was `>=20`) as part of moving the project to Node 24 LTS.

  Node.js 20 reached end of life in April 2026. `@lonca/core` now requires Node 22 (maintenance LTS) or newer.
