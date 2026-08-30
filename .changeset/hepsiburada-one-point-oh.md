---
'@lonca/hepsiburada': major
---

First stable release. The public API is identical to the previous minor —
upgrading requires no code changes. From 1.0.0 on, `@lonca/hepsiburada` follows
the stability policy documented at https://loncadev.github.io/lonca/stability/:
breaking changes only in major versions, deprecations announced at least two
minors before removal, and the exported API surface is locked in CI.

Verified read-only against the production API (merchant account, 2026-08-30):
all twelve contract probes answer 200, including `catalog.listProductsByStatus`
(the pre-0.13.0 bare-500 regression stays fixed on production) and the
per-service host routing — `mpfinance`, `asktoseller`, `diskonto`, `mpop`, and
`supplier-api` all resolve and answer route-level JSON on their dedicated
production hostnames.
