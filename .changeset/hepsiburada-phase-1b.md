---
'@lonca/hepsiburada': minor
---

feat(hepsiburada): Phase 1b — shipping, claims, test orders (11 endpoints, 3 resources)

Adds the remaining four OpenAPI-spec-backed Hepsiburada surfaces, completing
coverage of every spec-backed product on developers.hepsiburada.com (5 of 20):

- **`shipping`** (4 methods) — `shipping-entegrasyonu`: `getCargoFirms()`,
  `listProfiles()`, `createProfile()`, `updateProfile()`. Service base:
  `shipping-external[-sit].hepsiburada.com`.
- **`claims`** (6 methods) — `talep-listeleme` + `talep-olusturma`:
  `list()`, `listByStatus()`, `accept()`, `reject()`, `preApprovalConfirm()`,
  `create()`. Dual-service routing: list / status / actions on
  `oms-external[-sit]`, create on `claim-stub-external[-sit]`.
- **`testOrders`** (1 method, SIT sandbox only) — `test-siparisi-olusturma`:
  `create()` on `oms-stub-external[-sit]`.

The shipping / talep-* OpenAPI specs are skeletal (paths only, body schemas
empty). Path params + known query params are typed strictly; bodies accept
`Record<string, unknown>` with portal-doc references in JSDoc.

Total coverage now: 29 endpoints across 4 resources (listings, shipping,
claims, testOrders) — every Hepsiburada API surface that ships with a
machine-readable OpenAPI spec.
