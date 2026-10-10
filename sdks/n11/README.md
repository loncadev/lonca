# @lonca/n11 (research skeleton, not published)

> [!WARNING]
> **Not a supported SDK.** This package is `private`, at version `0.0.0`, and is never published to
> npm. Only its read calls have been checked against the live n11 API (prod, 2026-10-10, GET only);
> nothing that writes has been run. It exists so the n11 integration can be designed and reviewed.

> [!IMPORTANT]
> **Unofficial.** Lonca is not affiliated with, endorsed by, or supported by n11. "n11" and related
> names are trademarks of their respective owners.

- Research notes, sources and open questions: [`RESEARCH.md`](RESEARCH.md)
- Covered so far: `createN11Client`, `products.list()` (`GET /ms/product-query`),
  `categories.list()` / `categories.getAttributes()` (`/cdn/...`) and `orders.list()`
  (`GET /rest/delivery/v1/shipmentPackages`), on a `@lonca/core` transport that sends n11's
  `appkey` / `appsecret` headers. Read-only contract probes: `pnpm probe:prod -- --only n11`.
- SOAP reads (not yet called live): `questions.list()` / `get()`, `claims.listReturns()` /
  `listCancels()` and the reason-type lists, and `shipping.getShipmentCompanies()`. They use a small
  in-repo XML layer with no dependency.

```ts
import { paginate } from '@lonca/core';
import { createN11Client } from '@lonca/n11';

const client = createN11Client({
  appKey: process.env.N11_APP_KEY!,
  appSecret: process.env.N11_APP_SECRET!,
  env: 'prod', // n11 documents no sandbox
  integratorName: 'MyCompany',
});

for await (const product of paginate((p) => client.products.list({ ...p, limit: 250 }))) {
  console.log(product.stockCode, product.quantity, product.salePrice);
}
```
