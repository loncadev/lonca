# @lonca/trendyol

Type-safe TypeScript SDK for the [Trendyol Marketplace API](https://developers.trendyol.com).

> ⚠️ **Alpha** — Only the `brands` resource is implemented in this initial scaffold. More endpoints (orders, products, inventory, webhooks) land in follow-up releases.

## Install

```bash
pnpm add @lonca/trendyol
```

## Quick start

```ts
import { createTrendyolClient } from '@lonca/trendyol';
import { paginate } from '@lonca/core';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'stage', // or 'prod'
  integratorName: 'MyCompany', // optional; defaults to 'SelfIntegration'
});

for await (const brand of paginate((p) => client.brands.list(p))) {
  console.log(brand.id, brand.name);
}
```

## Authentication

Trendyol uses HTTP Basic Auth. Get your `sellerId`, `apiKey`, and `apiSecret` from the [Trendyol Partner Panel → Account Info → Integration Information](https://partner.trendyol.com/account/info?tab=integrationInformation) (master-user only).

**Production vs Stage** have different credentials. Stage also requires IP whitelisting — register your CI/server IP with Trendyol support.

## Built-in robustness

- **Retry with exponential backoff** on 429 (respects `Retry-After`) and 5xx
- **Per-endpoint rate limiting** (token bucket) sized to Trendyol's documented limits
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Correlation ID** auto-generated per request (`x-correlationid` header) for Trendyol-side log tracing
- **`AbortSignal` support** for cancellation throughout

## Environments

| Env     | Base URL                          | Notes                                         |
| ------- | --------------------------------- | --------------------------------------------- |
| `prod`  | `https://apigw.trendyol.com`      | No IP whitelist                               |
| `stage` | `https://stageapigw.trendyol.com` | IP whitelist required — call Trendyol support |

## Stability

`0.x` — alpha. Public APIs may change between minor versions until `1.0.0`.

## License

MIT
