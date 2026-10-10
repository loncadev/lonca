---
'@lonca/trendyol': minor
'@lonca/hepsiburada': minor
---

`createTrendyolClient` and `createHepsiburadaClient` accept an optional `fetch` implementation (e.g. to add a proxy agent, or to record or mock traffic). It defaults to the global `fetch`, so existing code is unaffected.
