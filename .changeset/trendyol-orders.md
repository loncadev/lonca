---
'@lonca/trendyol': minor
---

Add `orders` resource — list shipment packages (Trendyol's `getShipmentPackages`).

- `client.orders.list({ cursor?, limit?, status?, orderNumber?, startDate?, endDate? })` → `CursorPage<ShipmentPackage>`
  - GETs `/integration/order/sellers/{sellerId}/orders`
  - Page-based pagination internally; SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
  - Filters: `status`, `orderNumber`, date range
  - Page size capped at Trendyol's 200 max

Discovery-first workflow: a separate `examples/inspect-orders.mts` script (`pnpm try:inspect-orders`) was used to dump the **real STAGE wire shape** _before_ writing types. The resulting types model the field set as Trendyol actually returns it (47 root-level fields on the package, nested `lines[]`, `packageHistories[]`, `invoiceAddress`, `shipmentAddress`). Wire field `3pByTrendyol` (cannot start with a digit in TypeScript identifiers) is renamed to `threePByTrendyol` on the public surface.

New exports:
- `OrdersResource`, `ListOrdersParams`
- `ShipmentPackage`, `ShipmentPackageStatus`, `OrderLine`, `OrderLineDiscountDetail`, `OrderAddress`, `OrderAddressLines`, `OrderCustomer`, `PackageHistoryEntry`

Smoke verified live on Trendyol STAGE 2026-05-25: pulled 2 packages
(`Invoiced` 85 TRY, `Picking` 1300 TRY) with lines and customer info parsed
correctly. Regression mock test pins the exact PROD-shape package.

Phase 1 SDK now covers the full bottom-up chain: brands → categories → suppliers → products → inventory (write) → orders.
