---
'@lonca/trendyol': minor
---

Add **Phase 3e — order read variants** (2 endpoints). Final sub-group of Phase 3 — the orders surface is now feature-complete.

### New methods

- **`client.orders.listStream({ cursor?, limit?, packageItemStatuses?, lastModifiedStartDate?, lastModifiedEndDate? })`** → `CursorPage<ShipmentPackage>`
  - `GET /integration/order/sellers/{sellerId}/orders/stream`
  - Streaming alternative to `orders.list` with **opaque cursor pagination** (vs page-index on `list`). Required when the dataset exceeds 10 000 records — bypasses the page-size cap.
  - Same `ShipmentPackage` shape as `list`; the normalizer was extended to accept Trendyol's stream-only `id` field (vs `shipmentPackageId` on the regular list).

- **`client.orders.getCargoInvoiceItems(invoiceSerialNumber, { cursor?, limit? })`** → `CursorPage<CargoInvoiceItem>`
  - `GET /integration/finance/che/sellers/{sellerId}/cargo-invoice/{invoiceSerialNumber}/items`
  - Per-parcel cargo-fee breakdown for one cargo invoice. Useful for reconciling Trendyol cargo deductions against your shipped packages. `invoiceSerialNumber` comes from the Current Account Statement with `transactionType=DeductionInvoices`.
  - Page-based pagination (default page size 500, max 500).
  - Note the different path prefix — `/integration/finance/che/...`, not the regular `/integration/order/...`.

### Discovery-first wire fix

The regular `getShipmentPackages` returns `shipmentPackageId`, but the new `getShipmentPackagesStream` returns the same field as `id`. SDK normalizer now accepts both (`shipmentPackageId ?? id`), and the existing `ShipmentPackage.id` public field stays unchanged for callers.

### New exports

- `CargoInvoiceItem`
- `ListOrdersStreamParams`

### Smoke verified (STAGE 2026-05-25)

```
── 6.8 orders.listStream({ limit: 2 })
✓ Got 2 package(s) (nextCursor: eyJzIjpbMjczOCwxNzc5NzI1…)
    pkg   92051591  order 1017338323  Cancelled   0 TRY
    pkg   92027347  order 1238514712  Invoiced    35.79 TRY

── 6.9 orders.getCargoInvoiceItems("LONCA-FAKE-INVOICE")
ℹ getCargoInvoiceItems wire-verified: HTTP 200 for fake serial (empty content array — Trendyol returns empty for unknown serials)
```

### Phase 3 complete

- 3a (#22): status lifecycle (4) ✅
- 3b (#23): splitting (4) ✅
- 3c (#24): cargo/delivery (4) ✅
- 3d (#25): operational metadata (3) ✅
- **3e (this): read variants (2) ✅**

**Total: 17 new order endpoints + 1 normalizer extension across 5 stacked PRs.** Orders surface is feature-complete. Next: Phase 4 — Returns/Claims (10 endpoints).
