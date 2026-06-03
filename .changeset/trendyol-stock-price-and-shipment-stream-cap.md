---
"@lonca/trendyol": minor
---

feat(trendyol): add `products.listInventoryAndPrice()` and guard `orders.list()` against the 10,000-record cap

Responds to two Trendyol integration notices:

- **New `products.listInventoryAndPrice(params)`** — wraps Trendyol's lightweight `GET /products/approved/inventory-and-price` filter, which returns only stock + price for approved products. Filter by `barcode`, `contentId`, `stockCode`, `productMainId`, or listing `status`; sort with `orderByDirection`; page with the opaque cursor (forwarded as `nextPageToken`, `size` capped at 100). Optional `storeFrontCode` is sent as a request header (required on the International marketplace). Returns `CursorPage<ProductStockPrice>`; each variant carries `barcode`, `salePrice`, `listPrice`, `quantity`, `stockCode`, and `stockLastModifiedAt` (ISO, omitted when stock was never updated). New exported types: `ListInventoryAndPriceParams`, `ApprovedProductStatus`, `ProductStockPrice`, `ProductStockPriceVariant`.
- **`orders.list()` now fails fast** with a `ValidationError` when `page × size` would exceed the 10,000-record cap Trendyol enforces on `getShipmentPackages` (effective 2026-06-08, otherwise HTTP 429), pointing callers to `orders.listStream()` for full scans. The stale rate-limit doc comment is updated. No change to `listStream()` — it already implements `getShipmentPackagesStream` (cursor-based, last 3 months).
- **Transport** gained optional per-request `headers` support (used by `listInventoryAndPrice` for `storeFrontCode`).
