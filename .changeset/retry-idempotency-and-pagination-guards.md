---
'@lonca/core': minor
'@lonca/trendyol': patch
'@lonca/hepsiburada': patch
---

Harden retry, backoff, and pagination against duplicate writes and retry storms.

- **Retries no longer replay non-idempotent writes on ambiguous failures.** A
  timed-out, 5xx, or network-failed `POST`/`PUT`/`DELETE`/`PATCH` may already
  have committed server-side, so it is no longer auto-retried (which could
  duplicate an order split, cancel, or price/stock push). Only `429` — which the
  server provably rejected before processing — is replayed for writes; `GET`
  still retries normally. Pass `idempotent: true` on a request to opt a write
  back into full retries when it carries an idempotency key. New `@lonca/core`
  export: `isRetryableIdempotentOnly`.
- **`Retry-After` parsing is unified and fixed.** A `Retry-After: 0` (or blank /
  past-date) header no longer collapses exponential backoff to a zero-delay
  retry storm. The parser now lives in `@lonca/core` (new export
  `parseRetryAfter`) and is shared by both SDKs, ending the Trendyol/Hepsiburada
  drift; `retry()` also defensively ignores a non-positive `retryAfterMs`.
- **Trendyol `orders.list()` no longer throws mid-pagination at the 10k cap.**
  When the next page would exceed the 10,000-record offset cap, `nextCursor` is
  withheld so `paginate()` ends cleanly instead of handing back a cursor that
  then throws a `ValidationError`. Use `listStream()` for full scans.
- **Shared transport lifecycle.** The request loop (rate-limit, fetch under a
  composed timeout, FormData/JSON body, 204 handling, error mapping, retry, and
  logging) is now a single `createRequester` factory in `@lonca/core`, with each
  SDK injecting only its marketplace-specific seams (URL building, headers,
  status→error mapping). This removes ~150 duplicated lines per SDK and the
  drift between them; as a side effect the Hepsiburada transport regains
  per-request `headers` support. New `@lonca/core` exports: `createRequester`,
  `BaseRequestOptions`, `RequesterConfig`.
