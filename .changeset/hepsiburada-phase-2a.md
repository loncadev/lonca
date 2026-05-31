---
'@lonca/hepsiburada': minor
---

feat(hepsiburada): Phase 2a — orders, categories, catalog products (5 endpoints, 3 resources) + critical User-Agent fix

**Critical fix**: prior versions (0.1.0 / 0.2.0) sent
`User-Agent: {merchantId} - {integratorName}` which Hepsiburada SIT rejects with
401/403 across listings / OMS / mpop. The SDK now sends the bare
`integratorName` (e.g. `beekod_dev`) — what merchants configure server-side.
Live-verified against SIT for all 7 resources (listings, shipping, claims,
testOrders, orders, categories, catalog). **Upgrade required for working
production calls.**

New discovery-first resources (no upstream OpenAPI — shapes derived from live
SIT probing):

- **`orders`** (2 methods, `oms-external`):
  - `list({status?, beginDate?, endDate?, offset?, limit?})` — wrapped
    `{ totalCount, limit, offset, pageCount, items[] }`
  - `listPackages({...})` — raw array of shipping packages

- **`categories`** (2 methods, `mpop` umbrella):
  - `list({page?, size?, leaf?})` — Spring-style envelope
    `{ totalElements, totalPages, data[] }`; ~27k categories total
  - `getAttributes(categoryId)` — **leaf-only**; non-leaf categories throw
    `ValidationError` with Hepsiburada code `1003`

- **`catalog`** (1 method, `mpop` umbrella):
  - `listProducts({page?, size?})` — merchant catalog rows with per-field
    revision history, validation state, matching state, product-quality score

Adds a new `mpop` service to the transport's base-URL table
(`mpop[-sit].hepsiburada.com`) for the catalog / category surfaces. Resources
already on `oms-external` (claims) now share that host with `orders`.

**Total Hepsiburada coverage: 34 endpoints / 7 resources** — 8 of 20 API
products covered. Remaining doc-only surfaces (suppliers, finance / settlements,
e-invoice, tickets, notifications, questions, promotions) need either upstream
OpenAPI publication or merchant-portal endpoint hints for Phase 2b.
