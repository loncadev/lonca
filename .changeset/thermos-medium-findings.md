---
'@lonca/core': minor
'@lonca/hepsiburada': patch
---

Resolve the remaining review findings: money rounding, error redaction, and a typed capabilities contract.

- **`moneyFromMajor` rounds in decimal space.** It now scales via the number's
  string form (`"1.255e2"` → exactly `125.5`) instead of `major * 10 ** scale`,
  which first produces a binary-rounded product like `125.49999999999999`. So
  `moneyFromMajor(1.255, TRY)` is now `126` (was `125`) and `1.005` is `101`
  (was `100`), matching the decimal you actually wrote. Non-finite inputs now
  throw a `TypeError` instead of silently producing `NaN`.
- **Shared capabilities contract.** New `@lonca/core` export
  `MarketplaceCapabilities`; each SDK's `*Capabilities` constant now `satisfies`
  it (kept `as const`), so the cross-marketplace key set can't drift — a
  renamed or missing flag is a compile error instead of a silent `undefined`.
- **Hepsiburada 403 no longer leaks the raw server body.** `mapHttpError` gives
  `403` a fixed, safe message (`"Hepsiburada forbidden (check credentials,
  permissions, or User-Agent header)"`) instead of echoing the server's
  message, which can carry request context; the raw body stays on
  `error.data` / `cause` for debugging.
