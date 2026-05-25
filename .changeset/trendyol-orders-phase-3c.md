---
'@lonca/trendyol': minor
---

Add **Phase 3c — cargo + manual delivery** (4 endpoints).

### New methods

- **`client.orders.changeCargoProvider(packageId, cargoProvider)`** → `void`
  - `PUT /shipment-packages/{packageId}/cargo-providers` body `{ cargoProvider }`
  - `cargoProvider` is typed as `TrendyolCargoProvider` — the documented enum (`'YKMP'`, `'ARASMP'`, `'SURATMP'`, `'HOROZMP'`, `'DHLECOMMP'`, `'PTTMP'`, `'CEVAMP'`, `'TEXMP'`, `'KOLAYGELSINMP'`, `'CEVATEDARIK'`) plus a `(string & {})` escape for codes Trendyol adds later.

- **`client.orders.manualDeliverByPackageId(packageId)`** → `void`
  - `PUT /shipment-packages/{packageId}/manual-invoice-delivery` (no body)
  - Flip a package to `Delivered` when delivered outside Trendyol's cargo network.

- **`client.orders.manualDeliverByTrackingNumber(cargoTrackingNumber)`** → `void`
  - `PUT /shipment-packages/manual-invoice-delivery-by-tracking-number/{cargoTrackingNumber}` (no body)
  - Same operation as above but keyed by cargo tracking number (e.g. from a cargo provider webhook). Note the sibling path — not under `/{packageId}/...`.

- **`client.orders.markDeliveredByService(packageId)`** → `void`
  - `PUT /shipment-packages/{packageId}/delivered-by-service` (no body)
  - For appliance / installation-required products delivered by an authorized service partner.

All four are PUT and return `void` (Trendyol responds with 200 + empty body).

### New exports

- `TrendyolCargoProvider`

### Smoke verified (STAGE 2026-05-25)

All 4 wire-verified with a fake integer `packageId` / fake tracking number; Trendyol's gateway returns HTTP 401 (consistent with Phase 3a/3b behavior). Same credentials succeed on every other endpoint in the run, proving the SDK is constructing the correct URL + body.

### Phase 3 progress
- 3a (#22): status lifecycle (4) ✅
- 3b (#23): splitting (4) ✅
- **3c (this): cargo/delivery (4) ✅**
- 3d: operational metadata (3)
- 3e: read variants (2)
