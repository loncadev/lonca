---
'@lonca/trendyol': minor
---

Add **Phase 3b — shipment-package splitting**: 4 endpoints for re-arranging order lines into new packages.

### New methods (all POST, all `void`)

- **`client.orders.splitPackage(packageId, orderLineIds)`** → `void`
  - `POST /shipment-packages/{packageId}/split` body `{ orderLineIds }`
  - Moves the listed line IDs into a single new package; the original keeps the remainder.

- **`client.orders.splitPackageByQuantity(packageId, quantitySplit)`** → `void`
  - `POST /shipment-packages/{packageId}/quantity-split` body `{ quantitySplit: [{ orderLineId, quantities: number[] }] }`
  - Carves one line into multiple packages by quantity (e.g. `quantities: [2, 2, 1]` splits 5 units into 3 packages).

- **`client.orders.multiSplitPackage(packageId, splitGroups)`** → `void`
  - `POST /shipment-packages/{packageId}/multi-split` body `{ splitGroups: [{ orderLineIds: number[] }] }`
  - Splits into multiple new packages by grouping line IDs.

- **`client.orders.splitMultiPackagesByQuantity(packageId, splitPackages)`** → `void`
  - `POST /shipment-packages/{packageId}/split-packages` body `{ splitPackages: [{ packageDetails: [{ orderLineId, quantities: number }] }] }`
  - Most expressive — multiple new packages, each with multiple lines + per-line single-integer `quantities`.

All four throw `ValidationError` on empty input arrays before hitting the wire.

### New exports

- `QuantitySplit` — per-line quantity-split entry (`quantities: number[]`)
- `SplitGroup` — grouping of line IDs for `multiSplitPackage`
- `PackageDetail` — single line + quantity for `splitMultiPackagesByQuantity` (note: singular `quantities: number`, intentional naming mismatch with the API)
- `SplitPackagePlan` — one new package's full contents

### Smoke verified (STAGE 2026-05-25)

All 4 endpoints wire-verified with a fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on the split endpoints (same gateway-layer behavior as Phase 3a) — same credentials succeed on every other endpoint in the same smoke run, proving the SDK constructs the correct URL + body. No real package state touched.

### Phase 3 progress
- 3a (#22): status lifecycle (4) ✅
- **3b (this): splitting (4) ✅**
- 3c: cargo/delivery (4)
- 3d: operational metadata (3)
- 3e: read variants (2)
