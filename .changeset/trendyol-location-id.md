---
'@lonca/trendyol': minor
---

Fix `locations.getTurkeyDistricts` / `getTurkeyNeighborhoods` (and the Azerbaijan
variants) returning **500**. Trendyol's nested location endpoints key off the
city/district **internal id**, but `City` only exposed the display `code` — e.g.
Adana is `{ id: 100, code: "1" }`, so the natural `getTurkeyDistricts(city.code)`
call hit the id-only path with `"1"` and 500'd.

`City`, `District`, and `Neighborhood` now expose an `id` field (distinct from
`code`), and the district/neighborhood lookups take that id. Verified live:
`getTurkeyDistricts(city.id)` → 15 districts; `getTurkeyNeighborhoods(city.id,
district.id)` → 31 neighborhoods.
