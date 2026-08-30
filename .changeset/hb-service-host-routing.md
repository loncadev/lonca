---
'@lonca/hepsiburada': minor
---

Route five resources to their real service hosts (previously all five went through `oms-external`, where every call failed with 401/404 — verified against SIT):

| Resource         | Old host       | New host                           |
| ---------------- | -------------- | ---------------------------------- |
| `accounting`     | `oms-external` | `mpfinance-external[-sit]`         |
| `suppliers`      | `oms-external` | `supplier-api-external[-sit]`      |
| `questions`      | `oms-external` | `api-asktoseller-merchant[-sit]`   |
| `promotions`     | `oms-external` | `diskonto-external[-sit]`          |
| `productUpdates` | `oms-external` | `mpop[-sit]` (`/ticket-api` base)  |

Request-shape fixes that the real services require:

- `questions.*` now sends the required `merchantId` **header** on every call (missing it yields 401), and `questions.list()` pages with the API's `page`/`size` parameters and filters with `minCreatedAt`/`maxCreatedAt`. The old `offset`/`limit`/`beginDate`/`endDate` params still work as deprecated aliases.
- `accounting.listTransactions()` sends the spec's PascalCase query parameters (`Offset`/`Limit`, defaulted to `0`/`100` since the API requires them) on the spec's lowercase `/transactions/merchantid/{id}` path, and exposes the full filter surface (`orderNumber`, `sku`, `orderDateStart`/`orderDateEnd`, `recordDateStart`/`recordDateEnd`, …). The API requires either an identifier filter or a date-range pair spanning at most 1 month. `beginDate`/`endDate` remain as deprecated aliases of `orderDateStart`/`orderDateEnd`.
- `promotions.listDiscounts()` now sends the required `page`/`pagesize` query parameters (defaults `1`/`100`) and accepts an optional `{ page, pageSize }` argument.

Normalization fixes for the real services' response shapes (both verified on SIT):

- `promotions.listCategories()` / `listDiscounts()` unwrap diskonto's PascalCase `{ Data: [...] }` envelope (previously the rows were silently dropped) and categories map the wire's `categoryName` onto `name`.
- `questions.getCountByStatus()` surfaces the API's flat per-status body (`{ waitingForAnswer, answered, ... }`) as `byStatus`.

Compatibility note: no method signatures were removed, but calls to these five resources previously **always** failed with 401/404 — they now reach the real services and can return data (or real, route-level errors such as a supplier-enrollment 404).
