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

/**
 * Allowed values for `claims.listByStatus(status)`. The published OpenAPI
 * spec types this as a string enum:
 * `NewRequest | Accepted | AwaitingAction | InDispute | Rejected |
 * Refunded | Cancelled | AwaitingPreApproval`. Trendyol's `Open` / `Closed`
 * naming does **not** apply — Hepsiburada returns
 * `400 "Wrong Claim Status"` for any other value.
 *
 * Open-ended to allow forward-compatibility if Hepsiburada adds a new
 * status without an SDK release; explicit literals are intellisense-friendly.
 */
export type ClaimStatus =
  | 'NewRequest'
  | 'Accepted'
  | 'AwaitingAction'
  | 'InDispute'
  | 'Rejected'
  | 'Refunded'
  | 'Cancelled'
  | 'AwaitingPreApproval'
  | (string & {});

/** A single claim row surfaced by `claims.list*()`. */
export interface Claim {
  claimNumber?: string;
  status?: ClaimStatus;
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
 * Payload for `claims.create()`. Common fields are typed as hints; the
 * `& Record<string, unknown>` keeps Hepsiburada's full `createClaimRequest` body
 * open so undocumented/extra fields still pass through verbatim.
 */
export type CreateClaimInput = {
  orderNumber?: string;
  /** Line items being claimed (shape per Hepsiburada's portal docs). */
  lines?: unknown[];
} & Record<string, unknown>;

/**
 * Payload for `claims.accept()` / `claims.reject()` / `claims.preApprovalConfirm()`.
 * Common fields typed as hints; open for the rest.
 */
export type ClaimActionInput = {
  /** Reason code for accept/reject. */
  reasonCode?: string;
  /** Pre-approval confirmation flag (`preApprovalConfirm`). */
  confirmed?: boolean;
} & Record<string, unknown>;
