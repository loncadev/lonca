---
'@lonca/hepsiburada': minor
---

Fix three read endpoints that silently returned empty results, found by
verifying every GET endpoint against the live API.

- **`shipping.getCargoFirms` / `shipping.listProfiles`** returned `[]` because
  Hepsiburada wraps the rows under endpoint-specific keys (`cargoFirms`,
  `profiles`) that the SDK didn't unwrap. They now resolve those keys (live: 5
  cargo firms / 9 profiles, previously 0).
- **`categories.getAttributes`** returned `[]` because the response nests
  attributes in `data` under three buckets (`baseAttributes`, `attributes`,
  `variantAttributes`) rather than a bare array. They're now flattened into one
  `CategoryAttribute[]`, each tagged with a new `group` field
  (`'base' | 'category' | 'variant'`). Live: 38 attributes, previously 0.
- **`claims.list` / `claims.listByStatus`** failed with `400 "LimitCannotBeEmpty"`
  when called without pagination. `offset`/`limit` now default to `0`/`100`
  (override via params), so `claims.list()` works out of the box.
