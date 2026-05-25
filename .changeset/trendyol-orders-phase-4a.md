---
'@lonca/trendyol': minor
---

Add **Phase 4a — manual returns + Trendyol Express compensation** (3 endpoints).

### New methods

- **`client.orders.manualReturnByPackageId(packageId)`** → `void`
  - `PUT /shipment-packages/{packageId}/manual-return` (no body)
  - Seller-side notification that a shipped package was received back outside Trendyol's return-cargo flow.

- **`client.orders.manualReturnByTrackingNumber(cargoTrackingNumber)`** → `void`
  - `PUT /shipment-packages/manual-return-by-tracking-number/{cargoTrackingNumber}` (no body, sibling path)
  - Same operation keyed by cargo tracking number.

- **`client.orders.getCompensationTickets({ cursor?, limit?, startDate?, endDate? })`** → `CursorPage<CompensationTicket>`
  - `GET /integration/tex/compensation/sellers/{sellerId}/tickets`
  - Trendyol Express compensation tickets — claims filed when a shipment is lost or damaged in transit. 18-state lifecycle (`CompensationApproved`, `CompensationRejected`, `FoundInCompensation`, etc.).
  - **Requires Trendyol Express enrollment** (similar to AutoFT-only endpoints) — sellers without TEX get HTTP 401.
  - Note the different path prefix: `/integration/tex/compensation/...`, not `/integration/order/...`.

### Discovery-first wire details

`getCompensationTickets` response envelope is unusual — spec documents `{ totalCount, data: { items: [...] } }`. The SDK accepts that **plus** common fallbacks (`data: [...]` raw array, `content: [...]`) so live wire surprises don't break callers. The 3 shapes are pinned by separate mock tests.

### New exports

- `CompensationTicket`
- `CompensationTicketState` (18-value open enum)
- `CompensationItemDetail`
- `ListCompensationTicketsParams`

### Smoke verified (STAGE 2026-05-25)

```
ℹ wire-verified (rejected, no real data touched) manualReturnByPackageId      HTTP 401
ℹ wire-verified (rejected, no real data touched) manualReturnByTrackingNumber HTTP 401
ℹ getCompensationTickets: HTTP 401 (TEX enrollment required; same wire pattern as AutoFT-only categories.getByBarcodes)
```

### Phase 4 progress

- **4a (this): manual returns + TEX compensation (3) ✅**
- 4b: claims write+read (6) — createClaim, createClaimIssue, approveClaimLineItems, getClaims, getClaimIssueReasons, getClaimItemAudits

After 4b, the returns/claims surface is feature-complete. Next: Phase 5 (webhooks).
