---
'@lonca/trendyol': minor
---

Initial release of `@lonca/trendyol` — type-safe SDK for the Trendyol Marketplace API.

This first scaffold proves the transport spine end-to-end. Subsequent releases will fill in the orders, products, inventory, and webhook resources.

- `createTrendyolClient({ sellerId, apiKey, apiSecret, env, integratorName?, clientIp?, logger?, timeoutMs? })` factory
- `client.brands.list()` — first endpoint, paginated via `@lonca/core` `CursorPage`, rate-limited to Trendyol's 50 req/min
- Transport layer with:
  - All 5 required Trendyol headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`)
  - Per-request UUID correlation IDs
  - Exponential backoff retry on 429 / 5xx (honors `Retry-After`)
  - Per-endpoint token-bucket rate limiting
  - `AbortSignal` + request timeout (default 30s)
- HTTP error mapping to `@lonca/core` error hierarchy (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- Dual ESM + CJS build via tsup, 35 vitest tests covering auth/errors/transport/brands
