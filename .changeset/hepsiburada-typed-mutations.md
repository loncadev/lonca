---
'@lonca/hepsiburada': minor
---

Type the claim/package/catalog mutation surface (feedback #4 + #5).

- **Returns (#4):** `catalog.approvePreMatch` / `rejectPreMatch` / `checkProductStatus`
  and `claims.accept` / `reject` / `preApprovalConfirm` / `create` now return a
  `MutationResult` (`{ raw: unknown }`) instead of bare `unknown` — the API response
  is on `.raw`. (`unknown` already forced a cast, so this is a one-line migration:
  `(x as T)` → `x.raw`.)
- **Inputs (#5):** `CreateClaimInput`, `ClaimActionInput`, `CreatePackagesInput`,
  `SplitPackageInput`, `CancelLineItemInput`, `PackageStatusInput`, and
  `ChangeCargoCompanyInput` now carry typed field hints intersected with
  `Record<string, unknown>`, so common fields autocomplete while undocumented ones
  still pass through (non-breaking).
