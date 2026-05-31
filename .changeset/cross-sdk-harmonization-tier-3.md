---
'@lonca/core': minor
'@lonca/hepsiburada': minor
'@lonca/trendyol': minor
---

feat: cross-SDK harmonization Tier 3 — `OffsetPage<T>` in core + Trendyol resource constructor refactor

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
