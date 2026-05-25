---
'@lonca/trendyol': minor
---

Add **Phase 3d — operational metadata** (3 endpoints).

### New methods

- **`client.orders.updateBoxInfo(packageId, { deci?, boxQuantity? })`** → `void`
  - `PUT /shipment-packages/{packageId}/box-info`
  - Update desi (volumetric weight) and/or box count. Both fields optional; send at least one for the call to be meaningful.

- **`client.orders.updateLaborCosts(packageId, items)`** → `void`
  - `PUT /shipment-packages/{packageId}/labor-costs`
  - **Wire note**: Trendyol's body is a **raw array** here (no `{ items: [...] }` envelope) — the SDK forwards as-is. `items: [{ orderLineId, laborCostPerItem }]`.
  - SDK throws `ValidationError` on empty input.

- **`client.orders.updateWarehouse(packageId, warehouseId)`** → `void`
  - `PUT /shipment-packages/{packageId}/warehouse` body `{ warehouseId }`
  - Reassign the package to a different warehouse. `warehouseId` comes from `client.suppliers.getAddresses()` (filter by `isShipmentAddress`).

### New exports

- `UpdateBoxInfoInput`
- `LaborCostInput`

### Smoke verified (STAGE 2026-05-25)

All 3 wire-verified with fake `packageId` → Trendyol returns HTTP 401 (same gateway behavior as Phase 3a/3b/3c).

### Phase 3 progress
- 3a (#22), 3b (#23), 3c (#24), **3d (this)** ✅ — 15 of 17 order-deep endpoints
- 3e: read variants (stream, cargo invoice) — last sub-group, then Phase 4 begins
