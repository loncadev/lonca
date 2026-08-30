---
"@lonca/core": major
---

First stable release. The public API is identical to 0.7.0 — upgrading requires
no code changes. From 1.0.0 on, `@lonca/core` follows the stability policy
documented at https://loncadev.github.io/lonca/stability/: breaking changes only
in major versions, deprecations announced at least two minors before removal,
and the exported API surface is locked in CI. The five documented transport
behaviours (raw-text fallback of `safeJson`, abort-reason bubbling during retry
backoff, non-positive `Retry-After` being ignored, GET bodies being discarded,
and FormData dropping a caller `Content-Type`) are part of the documented
contract.
