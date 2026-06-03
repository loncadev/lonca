<p align="left">
  <img src="https://raw.githubusercontent.com/loncadev/lonca/main/assets/brand/icon.svg" alt="Lonca" height="32">
</p>

# @lonca/core

Shared primitives for Lonca marketplace SDKs.

> Type-safe building blocks reused across every `@lonca/<marketplace>` SDK: money, errors, pagination, retry, logger, rate limiter.

## Install

```bash
pnpm add @lonca/core
```

## What's inside

| Primitive                | Purpose                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Money`, `Currency`      | ISO 4217 currency codes; integer minor-unit money representation; `moneyFromMajor`/`moneyToMajor` lira↔kuruş converters                                                                    |
| `CursorPage`, `paginate` | Cursor-based pagination + async iterator helper                                                                                                                                            |
| `LoncaError` hierarchy   | Structured errors (`AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, `ServerError`, `NetworkError`, `TimeoutError`) with `retryable` flag and a normalized `issues` array |
| `NormalizedOrderStatus`  | Closed cross-marketplace order-status vocabulary + `createStatusNormalizer` (surfaces unmapped statuses via `mapped: false`, never a silent default)                                       |
| `retry`                  | Exponential backoff with jitter, honors `retryAfterMs`, supports `AbortSignal`                                                                                                             |
| `Logger`                 | Structured logger interface (`debug`/`info`/`warn`/`error`/`child`) with `noopLogger` and `consoleLogger`                                                                                  |
| `TokenBucketRateLimiter` | Async token-bucket rate limiter with `AbortSignal` support                                                                                                                                 |

## Design principles

- **Money is an integer in minor units** — `{ amount: 12550, currency: 'TRY' }` means 125.50 TRY. No floats, no surprises. Marketplace SDKs hand you raw major-unit numbers (e.g. `199.9` lira); wrap them once with `moneyFromMajor(price, TRY)` instead of a hand-rolled `Math.round(price * 100)`.
- **Cursor pagination over offset** — opaque cursors compose better with async iterators and stay stable as datasets grow.
- **Errors are typed and tagged** — `err.code` plus a `retryable` boolean tells retry helpers what to do without sniffing messages.
- **Logger is an interface, not an implementation** — wire your own (pino, winston, console). A no-op default is provided.

## Stability

`0.x` — alpha. Public APIs may change between minor versions until `1.0.0`.

## License

MIT
