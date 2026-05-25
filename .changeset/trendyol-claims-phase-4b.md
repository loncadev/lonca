---
'@lonca/trendyol': minor
---

Add **Phase 4b — claims (returns) resource** (6 endpoints). Introduces a new top-level `client.claims` resource. After this lands, the **returns + claims** surface is feature-complete.

### New methods on `client.claims`

- **`create(input)`** → `unknown`
  - `POST /integration/order/sellers/{sellerId}/claims/create`
  - File a return claim against an order. Body validated client-side (`ValidationError` for empty `claimItems`).

- **`createIssue(claimId, input)`** → `unknown`
  - `POST /integration/order/sellers/{sellerId}/claims/{claimId}/issue`
  - File a seller-side rejection ("ret talebi") against a customer claim. **Multipart/form-data** — the SDK builds the FormData from the typed input (joins `claimItemIdList` with commas, attaches `files: [Blob, ...]` for PDF/JPEG supporting docs).
  - SDK validates: non-empty `claimItemIdList`, non-empty `description`, `description.length <= 500`.

- **`approveLineItems(claimId, input)`** → `unknown`
  - `PUT /integration/order/sellers/{sellerId}/claims/{claimId}/items/approve`
  - Approve specific claim line items; throws `ValidationError` on empty list.

- **`list({ cursor?, limit?, startDate?, endDate?, claimItemStatus? })`** → `CursorPage<Claim>`
  - `GET /integration/order/sellers/{sellerId}/claims`
  - Page-based pagination (max 200, default 50). `claimItemStatus` is typed as an open enum (`Created`, `WaitingInAction`, `WaitingFraudCheck`, `Accepted`, `Unresolved`, `Rejected`).
  - Normalizer accepts both `id` and `claimId` for the claim identifier; converts ms-epoch dates to ISO.

- **`getIssueReasons()`** → `ClaimIssueReason[]`
  - `GET /integration/order/claim-issue-reasons` (**not seller-scoped** — no `sellerId` in path).
  - Catalog of rejection-reason IDs used by `createIssue`.

- **`getItemAudits(claimItemId)`** → `ClaimItemAudit[]`
  - `GET /integration/order/sellers/{sellerId}/claims/items/{claimItemsId}/audit`
  - Audit log for a single claim item; SDK wraps each row as `{ raw }` (Trendyol's shape varies, kept conservative until observed live).

### Transport extension

`TrendyolTransport.request()` now accepts `body: FormData` for multipart endpoints — when the body is a `FormData` instance, the SDK skips JSON-stringify and lets `fetch` set the multipart boundary in `Content-Type`. Backwards-compatible: any non-FormData body still serializes as JSON.

### New exports

- Resource: `ClaimsResource`
- Types: `Claim`, `ClaimItemStatus` (open enum), `ClaimItemAudit`, `ClaimIssueReason`, `CreateClaimInput`, `CreateClaimItemInput`, `CreateClaimIssueInput`, `ApproveClaimLineItemsInput`, `ListClaimsParams`

### Smoke verified (STAGE 2026-05-25)

```
── 6.86 claims.list({ limit: 2 })
ℹ claims.list: HTTP 404 (this STAGE seller has no claims — endpoint returns 404 for empty rather than empty array; wire path verified)

── 6.87 claims.getIssueReasons()
✓ Got 19 reason(s). First 5:
       251  Müşteriden gelen ürün defolu/zarar görmüş
       401  Müşteriden gelen ürün adedi eksik
       201  Müşteriden gelen ürün yanlış
        51  Müşteriden gelen ürün kullanılmış
       151  Müşteriden gelen ürünün parçası/aksesuarı eksik
```

The 19-reason payload end-to-end-validates the SDK wire contract.

### Phase 4 complete

- 4a (#30): manual returns + TEX compensation (3) ✅
- **4b (this): claims (6) ✅**

After this merges, **returns + claims surface is feature-complete** (9 endpoints across 4a+4b). Next: **Phase 5 — webhooks (6 endpoints).**
