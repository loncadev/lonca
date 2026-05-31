/**
 * Hepsiburada Claims (Talep) types.
 *
 * Two backend services back this surface:
 *   - `talep-listeleme` (oms-external)        — list + accept / reject / preApproval
 *   - `talep-olusturma` (claim-stub-external) — create
 *
 * Like Shipping, the portal's OpenAPI for both is path-only; body shapes
 * are documented in the rendered doc pages. The SDK accepts loose
 * `Record<string, unknown>` bodies and surfaces responses with a typed
 * envelope + a `raw` escape hatch.
 */

/** A single claim row surfaced by `claims.list*()`. */
export interface Claim {
  claimNumber?: string;
  status?: string;
  /** ISO 8601-ish; Hepsiburada returns a server-local string. */
  createdAt?: string;
  /** Untouched raw row — pull full claim fields from here. */
  raw: Record<string, unknown>;
}

/** Filter / pagination params for `claims.list()`. */
export interface ListClaimsParams {
  /** Format: `yyyy-MM-dd HH:mm` (Hepsiburada's documented spelling). */
  beginDate?: string;
  /** Format: `yyyy-MM-dd HH:mm`. */
  endDate?: string;
  offset?: number;
  limit?: number;
}

/** Filter / pagination params for `claims.listByStatus()`. */
export interface ListClaimsByStatusParams extends ListClaimsParams {
  /** Filter on the claim's status-change date. */
  statusBeginDate?: string;
  /** Filter on the claim's status-change date. */
  statusEndDate?: string;
}

/**
 * Payload for `claims.create()`. Hepsiburada's `createClaimRequest` body
 * is documented on the portal — passes through verbatim.
 */
export type CreateClaimInput = Record<string, unknown>;

/** Payload for `claims.accept()` / `claims.reject()` / `claims.preApprovalConfirm()`. */
export type ClaimActionInput = Record<string, unknown>;
