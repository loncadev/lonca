---
'@lonca/trendyol': minor
---

Add a shared `ProductContentBase` interface, extended by both `Product` and
`UnapprovedProduct`, so callers can read the common content surface
(`productMainId`, `title`, `description`, `brand`, `category`, `images`,
`attributes`) from either shape without branching (feedback #8). The concrete
types are otherwise unchanged — `Product` keeps `variants[]`, `UnapprovedProduct`
stays flat — so this is purely additive.

Also clarified `products.list` docs: it returns **approved products only** (use
`listUnapproved` for drafts), and its date fields are ISO 8601 **strings**.
