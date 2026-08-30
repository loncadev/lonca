---
"@lonca/core": patch
"@lonca/trendyol": patch
"@lonca/hepsiburada": patch
---

Fix TypeScript type resolution for CommonJS consumers ("Masquerading as ESM"):
the `exports` maps now declare per-condition types (`import` resolves
`dist/index.d.ts`, `require` resolves `dist/index.d.cts`, including the SDKs'
`./testing` subpath). Runtime behaviour is unchanged; `publint` and
`arethetypeswrong` now verify the packages in CI.
