/**
 * Hepsiburada Supplier integration types (`tedarikci-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `tedarikci-entegrasyonu` v1.0.
 *
 * Five endpoints — open purchase orders search, supplier listings search,
 * listing-update-requests CRUD (search list / get / create).
 *
 * All search endpoints are POST with `{ pageNumber, pageSize, … }` style
 * bodies; the SDK accepts loose `Record<string, unknown>` payloads — see
 * the portal docs for the documented field set per request.
 */

/** Body for `suppliers.searchOpenPurchaseOrders()`. */
export type OpenPurchaseOrderSearchInput = Record<string, unknown>;

/** Body for `suppliers.searchSupplierListings()`. */
export type SupplierListingSearchInput = Record<string, unknown>;

/** Body for `suppliers.searchListingUpdateRequests()`. */
export type ListingUpdateRequestSearchInput = Record<string, unknown>;

/** Body for `suppliers.createListingUpdateRequest()`. */
export type CreateListingUpdateRequestInput = Record<string, unknown>;
