---
'@lonca/core': minor
---

Initial release of `@lonca/core` — shared primitives for every Lonca marketplace SDK.

- `Money` and `Currency` with integer minor-unit representation (ISO 4217)
- `CursorPage` and `paginate()` async iterator helper
- `LoncaError` hierarchy: `AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, `ServerError`, `NetworkError`, `TimeoutError` (each tagged with `code` and `retryable`)
- `retry()` helper with exponential backoff, jitter, `retryAfterMs` support, and `AbortSignal` cancellation
- `Logger` interface with `noopLogger` and a JSON-line `consoleLogger`
- `TokenBucketRateLimiter` with async `acquire()` and `AbortSignal` support
