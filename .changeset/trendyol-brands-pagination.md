---
'@lonca/trendyol': minor
---

Fix `brands.list` pagination: `paginate((p) => client.brands.list(p))` used to stop after the first page, because the SDK waited for a `totalPages` field that Trendyol never sends. When the response has no page count, a full page now sets `nextCursor` (a short page is the last one); a `totalPages` value is still honoured if present.

- `Brand` gains an optional `luxe` flag (Trendyol's luxury-brand marker, present on prod brand rows), on both `brands.list` and `brands.search`.
- `City.countryCode` is now filled with the country of the lookup (`'TR'`, `'AZ'`, or the `getCitiesByCountry` argument). Trendyol's city rows have no country field, so it was always `undefined` before.
