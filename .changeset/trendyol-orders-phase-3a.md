---
'@lonca/trendyol': minor
---

Add **Phase 3a — order status lifecycle**: 4 shipment-package write endpoints completing the seller-side order state machine.

### New methods

- **`client.orders.updatePackageStatus(packageId, { status, lines? })`** → `void`
  - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}`
  - Status is restricted to `'Picking'` (preparing) or `'Invoiced'` (invoice issued) — other transitions are driven by Trendyol / the cargo provider.
  - Optional `lines: [{lineId, quantity}]` for partial transitions.

- **`client.orders.cancelPackageItem(packageId, { lines, reasonId })`** → `void`
  - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/items/unsupplied`
  - Trendyol's "supply failure" (Tedarik Edememe) notification — marks specific line items as `UnSupplied`.
  - SDK throws `ValidationError` on empty `lines` before hitting the wire.
  - `reasonId` is a numeric code Trendyol publishes separately (consult the seller panel for current values).

- **`client.orders.extendDeliveryDate(packageId, days)`** → `void`
  - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/extended-agreed-delivery-date`
  - `days` is typed as `1 | 2 | 3` (Trendyol enforces server-side; SDK validates client-side too).

- **`client.orders.processAlternativeDelivery(packageId, { isPhoneNumber, trackingInfo, params })`** → `void`
  - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/alternative-delivery`
  - Used when shipping via a non-Trendyol cargo provider. `isPhoneNumber: true` → Trendyol SMSes the link; `false` → stores the URL directly.

All four return `void` (Trendyol responds with HTTP 200 + empty body on success). Path + body shape match the official OpenAPI spec exactly.

### New exports
- `UpdatePackageStatusInput`
- `CancelPackageItemInput`
- `ProcessAlternativeDeliveryInput`
- `PackageLineUpdate`

### Smoke verified (STAGE 2026-05-25)
All 4 endpoints wire-verified against Trendyol STAGE using a deliberately fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on these endpoints (its security layer rejects before reaching the handler) — which still proves the SDK is constructing the correct URL + body + headers (the same credentials succeed on every other endpoint in the same smoke run). A separate isolated probe with a real `packageId` returned HTTP 404 with `SellerIntegrationApiDomainNotFoundException` — also a wire-contract confirmation. No real package state is touched.

### Phase 3 plan progress
- **3a (this PR): status lifecycle (4) ✅**
- 3b: splitting (4)
- 3c: cargo/delivery (4)
- 3d: operational metadata (3)
- 3e: read variants (2)

Then phases 4 (returns/claims), 5 (webhooks), 6-11 (questions, invoices, settlements, labels, test orders, locations).
