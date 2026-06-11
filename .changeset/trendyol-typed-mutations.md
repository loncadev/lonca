---
'@lonca/trendyol': minor
---

The claim and invoice mutation methods (`claims.create` / `createIssue` /
`approveLineItems`, `invoices.uploadFile` / `sendLink` / `deleteLink`) now return a
`MutationResult` (`{ raw: unknown }`) instead of bare `unknown` — the API response
is on `.raw`. `unknown` already forced a cast, so this is a one-line migration.
