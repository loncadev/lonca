---
'@lonca/hepsiburada': minor
'@lonca/trendyol': minor
---

feat: cross-SDK harmonization (Tier 1 + 2 + 4 of consistency audit)

After a side-by-side consistency audit between the two SDKs, this release
unifies the small-but-pervasive surface differences. No new resources,
no new endpoints — just less surprise for callers using both SDKs.

**Tier 1 — DX wins (breaking type changes)**

- `@lonca/trendyol`: `integratorName` is now **required** on
  `CreateClientOptions` and the transport's `TransportConfig` (was
  optional, defaulted to `'SelfIntegration'`). Trendyol uses this to
  attribute API traffic — making it explicit prevents accidentally
  shipping `'SelfIntegration'` to production. `buildUserAgent(sellerId,
  integratorName)` also drops its default.
- `@lonca/hepsiburada`: transport adds per-request **correlation ID** —
  a UUID generated per call, included as `x-correlationid` request
  header, and surfaced in every `logger.debug` / `logger.warn` line.
  Mirrors what Trendyol's transport has done from day one; enables
  cross-marketplace log correlation.

**Tier 2 — Export hygiene (Hepsiburada)**

- `parseWebhookEvent` is the new canonical entry point — same function
  reference as `parseHepsiburadaWebhookEvent`, just a shorter name that
  matches `@lonca/trendyol`'s export. The old name stays exported as a
  `@deprecated` alias for one minor; remove in the following release.
- `HepsiburadaTransport`, `RequestOptions`, `TransportConfig`, and
  `HepsiburadaService` are **no longer exported** from the package
  index. They were internal implementation surface; keeping them
  exported was an oversight that forced any internal refactor to be
  breaking. `HepsiburadaEnvironment` remains exported (it's a
  config-relevant type users may want to type their own env switches
  with).

**Tier 4 — Documentation**

- Both READMEs gain a "Rate-limiter defaults" table listing per-resource
  capacity and interval so users don't have to read the source to know
  the budget.
- Both READMEs document the per-request correlation ID feature.

Verification: 438 mock tests pass across both packages (180 Hepsiburada
+ 258 Trendyol); typecheck + build green on both.
