---
'@lonca/trendyol': minor
'@lonca/hepsiburada': minor
---

Re-export the `@lonca/core` pagination helpers from each SDK.

`paginate`, `paginateOffset`, and the `CursorPage` / `OffsetPage` (and their
param) types are now re-exported from `@lonca/trendyol` and `@lonca/hepsiburada`,
so consumers can iterate list endpoints without taking a separate direct
dependency on `@lonca/core`:

```ts
import { paginate } from '@lonca/trendyol';
for await (const pkg of paginate((cursor) => client.orders.list({ cursor }))) { /* … */ }
```
