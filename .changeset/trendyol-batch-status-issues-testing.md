---
"@lonca/trendyol": minor
---

feat: batch helper, status map, normalized error issues, capabilities, and a test double

- **fix (breaking on the previously-broken path):** `inventory.update()` now throws `ServerError` when Trendyol accepts the request but returns no `batchRequestId`, instead of returning `{ batchRequestId: '' }`. An empty id is unpollable and was forcing consumers into sentinel hacks.
- `inventory.updateAndWait(items, opts?)` — chunks to ≤1000, submits, and polls each batch to a terminal state; returns one `BatchRequestResult` per chunk. Plus a standalone `pollBatchStatus(getStatus, id, opts)` for ids obtained elsewhere.
- `statusMap` + `normalizeStatus` — exhaustive over the known shipment-package statuses, mapping into core's `NormalizedOrderStatus`; unknown statuses surface via `mapped: false`. Adds `KnownShipmentPackageStatus` (the open wire type `ShipmentPackageStatus` is unchanged).
- `mapHttpError` now populates `LoncaError.issues` from Trendyol error bodies (`field`/`code`/`message` only — never the raw PII-bearing payload, which stays on `error.data`).
- `trendyolCapabilities` (`scheduledPricing` / `stockOnlyBatch` / `listingUpdatedAt`), also exposed as `client.capabilities`.
- New `@lonca/trendyol/testing` subpath export: `createFakeTrendyolClient(seed?)` — the real client graph over a fake transport for unit tests (batch hot-path works out of the box; drive other endpoints with `seed.handler`).
