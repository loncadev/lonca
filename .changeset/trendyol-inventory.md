---
'@lonca/trendyol': minor
---

Add `inventory` resource — Trendyol stock & price update (a.k.a. `updatePriceAndInventory`).

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
