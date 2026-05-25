---
'@lonca/trendyol': minor
---

Add `products` resource — Trendyol approved-product filter + async batch status helper.

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
