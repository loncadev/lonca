# @lonca/n11 (research skeleton, not published)

> [!WARNING]
> **Not a supported SDK.** This package is `private`, at version `0.0.0`, and is never published to
> npm. It has not been tested against the live n11 API. It exists so the n11 integration can be
> designed and reviewed before an n11 account is available.

> [!IMPORTANT]
> **Unofficial.** Lonca is not affiliated with, endorsed by, or supported by n11. "n11" and related
> names are trademarks of their respective owners.

- Research notes, sources and open questions: [`RESEARCH.md`](RESEARCH.md)
- Covered so far: `createN11Client` and `products.list()` (`GET /ms/product-query`), on a
  `@lonca/core` transport that sends n11's `appkey` / `appsecret` headers.

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
