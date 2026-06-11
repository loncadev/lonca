---
'@lonca/hepsiburada': patch
---

Document the FBH stock-overwrite hazard (feedback #3): `Listing.isFulfilledByHB`
and `listings.uploadStock` now warn that pushing stock to a Hepsiburada-fulfilled
listing overwrites Hepsiburada's warehouse stock and can oversell — filter those
SKUs out of stock sync unless you mean to override.
