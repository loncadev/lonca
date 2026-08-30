---
'@lonca/trendyol': major
---

First stable release. The public API is identical to the previous minor —
upgrading requires no code changes. From 1.0.0 on, `@lonca/trendyol` follows the
stability policy documented at https://loncadev.github.io/lonca/stability/:
breaking changes only in major versions, deprecations announced at least two
minors before removal, and the exported API surface is locked in CI.

Verified read-only against the production API (seller account, 2026-08-30): all
nine contract probes — products, orders, categories, brands, locations,
questions, claims, finance settlements, and webhooks — answer 200 with the
snapshotted shapes.

One behavioural fix is folded in: `webhooks.*` now calls Trendyol's documented
`/integration/webhook/sellers/{sellerId}/webhooks` path. The previous
`/integration/sellers/{sellerId}/webhooks` path is not routed on production
(the gateway answers a host-level 556); the documented path answers 200.
Verified live on production for `webhooks.list()`.
