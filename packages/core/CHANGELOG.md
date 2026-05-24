# @lonca/core

## 0.1.0

### Minor Changes

- [`027a090`](https://github.com/loncadev/lonca/commit/027a090a136e8051f5431e672ed8456068fc8e9e) Thanks [@keparlak](https://github.com/keparlak)! - Initial release of `@lonca/core` — shared primitives for every Lonca marketplace SDK.
  - `Money` and `Currency` with integer minor-unit representation (ISO 4217)
  - `CursorPage` and `paginate()` async iterator helper
  - `LoncaError` hierarchy: `AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, `ServerError`, `NetworkError`, `TimeoutError` (each tagged with `code` and `retryable`)
  - `retry()` helper with exponential backoff, jitter, `retryAfterMs` support, and `AbortSignal` cancellation
  - `Logger` interface with `noopLogger` and a JSON-line `consoleLogger`
  - `TokenBucketRateLimiter` with async `acquire()` and `AbortSignal` support

- [`499d404`](https://github.com/loncadev/lonca/commit/499d40419b81999a0ef997387278add9427386d8) Thanks [@keparlak](https://github.com/keparlak)! - Bump minimum Node.js to `>=22` (was `>=20`) as part of moving the project to Node 24 LTS.

  Node.js 20 reached end of life in April 2026. `@lonca/core` now requires Node 22 (active LTS) or newer.
