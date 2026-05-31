---
'@lonca/hepsiburada': minor
---

feat(hepsiburada): Phase 2c — ergonomics + strict types (live-SIT verified)

Three targeted hardening fixes after exhaustive live-SIT verification of
every read endpoint on the SDK. No new resources or methods — Phase 2c
tightens contracts and corrects path casing per spec.

**Breaking type changes** (runtime behavior preserved for valid inputs):

- **`listings.getBuyboxOrder(skuList)` / `getCommissions(skuList)`** — the
  `skuList` parameter is now **required** (was `string | undefined`). The
  published OpenAPI spec marks it optional, but the live API rejects empty
  with `400 "skuList cannot be empty"`. The SDK now validates client-side
  and throws `ValidationError` with a clear message before the request
  leaves the process. Callers passing an empty / undefined `skuList` were
  always silently getting `400` from Hepsiburada; they now get a typed
  error at call time.

- **`claims.listByStatus(status, ...)`** — `status` is now typed as
  `ClaimStatus`:
  ```ts
  type ClaimStatus =
    | 'NewRequest' | 'Accepted' | 'AwaitingAction' | 'InDispute'
    | 'Rejected'   | 'Refunded' | 'Cancelled'      | 'AwaitingPreApproval'
    | (string & {});
  ```
  Trendyol's `'Open'` / `'Closed'` naming does NOT apply to Hepsiburada;
  the live API rejects everything outside the published enum with
  `400 "Wrong Claim Status"`. The trailing `(string & {})` keeps the
  union forward-compatible if Hepsiburada adds a new status without an
  SDK release, while still giving intellisense for the documented set.

**Path casing alignment** (no behavior change):

- `orders` (28 methods), `claims` (already correct), `accounting`
  (1 method): all `/merchantid/{id}` segments updated to `/merchantId/{id}`
  per the published spec. Verified live: `oms-external-sit` accepts both
  casings and returns identical results.
- `listings` (18 methods): path stays at `/merchantid/{id}` (lowercase).
  Live verification revealed `listing-external-sit` is **case-sensitive**
  and returns `400 Bad Request` for the camelCase variant. The lowercase
  form is what the host actually serves.

The casing rationale is now documented per-resource in JSDoc.

Live SIT verification:
- 144 mock tests pass; typecheck + build green.
- `listings.list` → 89 listings (lowercase, unchanged).
- `orders.list` / `listMissingInvoicePackages` → 161 packages (camelCase
  works).
- `claims.listByStatus('AwaitingAction')` → 2 claims (strict union accepted).
- `listings.getBuyboxOrder('')` / `getCommissions('')` → `ValidationError`
  at call time (no network round-trip).
