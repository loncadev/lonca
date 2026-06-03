---
"@lonca/hepsiburada": minor
---

feat: pagination consistency, status map, normalized error issues, typed fields, capabilities, and a test double

- **breaking:** `listings.list()` now returns a core `OffsetPage<Listing>` (`.items` + `.pageCount`) instead of `{ listings, totalCount, limit, offset }`, so it composes with `paginateOffset` and matches every other list endpoint. `ListingsPage` stays exported as a **deprecated** alias of `OffsetPage<Listing>` for the lifetime of the `0.x` line — update `.listings` reads to `.items`.
- `statusMap` + `normalizeStatus` mapping known Hepsiburada order/package statuses into core's `NormalizedOrderStatus`; unknown statuses surface via `mapped: false`. Adds `KnownHepsiburadaOrderStatus`.
- `mapHttpError` now populates `LoncaError.issues` (`field`/`code`/`message` only — never raw PII) and aligns the raw body onto `error.data` (previously only on `cause`).
- `Order.customerName` and `Listing.updatedAt` are now surfaced (as `string | null`) from the raw row, so callers stop guessing from `raw`.
- `hepsiburadaCapabilities` (`scheduledPricing` / `stockOnlyBatch` / `listingUpdatedAt`), also exposed as `client.capabilities`.
- New `@lonca/hepsiburada/testing` subpath export: `createFakeHepsiburadaClient(seed?)` — the real client graph over a fake transport for unit tests.
