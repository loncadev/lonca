---
"@lonca/core": minor
---

feat: error + status-normalization primitives for marketplace SDKs (additive)

- `LoncaError.issues: LoncaErrorIssue[]` — a normalized, field-level error detail array (always present, defaults to `[]`). Each SDK maps its raw error body into it so consumers stop sniffing marketplace-specific JSON shapes.
- `NormalizedOrderStatus` — a closed, cross-marketplace order-status vocabulary, plus `createStatusNormalizer(map)`, which folds a raw status into the vocab and surfaces unmapped values via `{ mapped: false }` instead of silently defaulting.
- docs: `moneyFromMajor` / `moneyToMajor` now carry TRY lira↔kuruş `@example`s, and the README points marketplace prices at `moneyFromMajor(price, TRY)` instead of a hand-rolled `Math.round(x * 100)`.
