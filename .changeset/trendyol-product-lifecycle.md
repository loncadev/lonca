---
'@lonca/trendyol': minor
---

Add **Group 4 — product lifecycle**: `delete`, `archive`/`unarchive`, `unlock`.

### New methods

- **`client.products.delete(barcodes)`** → `BatchAcceptedResponse`
  - `DELETE /integration/product/sellers/{sellerId}/products` with body `{ items: [{barcode}] }`
  - Trendyol allows deletion of unapproved products and approved products that have been archived for more than a day (and not sales-stopped by Trendyol).
  - **Rate-limited separately at 100 req/min** — much tighter than the other writes (the SDK provisions a dedicated `deleteLimiter`).

- **`client.products.archive(barcodes)`** → `BatchAcceptedResponse`
- **`client.products.unarchive(barcodes)`** → `BatchAcceptedResponse`
  - Both `PUT /integration/product/sellers/{sellerId}/products/archive-state` with body `{ items: [{barcode, archived: bool}] }`
  - Exposed as two methods for ergonomic call sites; share one endpoint and one rate limiter.

- **`client.products.unlock(barcodes)`** → `BatchAcceptedResponse`
  - `PUT /integration/product/sellers/{sellerId}/products/unlock` with body `{ items: [{barcode}] }`
  - Restores selling status for products Trendyol paused due to pricing or supply issues.

All 4 return the standard `{ batchRequestId }` for `getBatchStatus` polling, max 1000 items per call, and throw `ValidationError` for empty or oversized inputs before hitting the network.

### Smoke verified (STAGE 2026-05-25, output)

```
── 6.45 products lifecycle smoke ────────────────────────
✓ delete       accepted; batchRequestId=a6e1dc0a-…
✓ archive      accepted; batchRequestId=23691686-…
✓ unarchive    accepted; batchRequestId=807b9632-…  (state restored)
✓ unlock       accepted; batchRequestId=f372ec93-…
```

All 4 endpoints round-trip with real batch IDs. Archive → unarchive on a real approved barcode completes safely (state restored). Delete + unlock exercise the wire with a throw-away fake barcode (per-item fails server-side without affecting real listings).

### Phase 2 progress

- Group 1 (#13): `categories.getAttributeValues` ✅
- Group 2 (#14): read completion ✅
- Group 3 (#15): write core ✅
- **Group 4 (this PR): lifecycle ✅**
- Group 5: helpers — `categories.getByBarcodes`, `brands.search`

After Group 5, **the Trendyol products surface is feature-complete**: brands → categories (tree + attrs + values + barcode→cat) → suppliers → products (read + write + lifecycle) → inventory → orders.
