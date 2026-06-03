---
'@lonca/core': minor
---

Add `normalizeIssueEntries` to `@lonca/core` and use it from both SDKs.

The PII-safe error-issue mapping (copy only `message`/`field`/`code` from each
raw entry, never the raw payload) was duplicated verbatim in the Trendyol and
Hepsiburada `normalizeErrorIssues`. It's now a single `@lonca/core` export; each
SDK keeps only its own body-shape extraction and delegates the entry mapping.
No behavior change — both SDKs produce identical issues — but the
security-sensitive redaction logic now lives in one place.
