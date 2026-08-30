import { ValidationError } from '@lonca/core';
import type { CatalogPagingParams } from './types/catalog-product.js';

/** Page-number paging as sent on the wire (`page` / `size`, both optional). */
export interface ResolvedCatalogPaging {
  page?: number;
  size?: number;
}

/**
 * Turn the caller's paging into Hepsiburada's page-number model (shared by the
 * `catalog` and `categories` list endpoints, which both speak the Spring
 * `page` / `size` dialect). `page` / `size` pass straight through; `offset` /
 * `limit` (the `paginateOffset` contract) are converted — which is only honest
 * when `offset` lands on a page boundary, so anything else is rejected instead
 * of silently rounded.
 */
export function resolveCatalogPaging(
  params: CatalogPagingParams,
  method: string,
): ResolvedCatalogPaging {
  const { page, size, offset, limit } = params;
  const usesOffset = offset !== undefined || limit !== undefined;
  const usesPage = page !== undefined || size !== undefined;
  if (usesOffset && usesPage) {
    throw new ValidationError({
      message: `${method}: pass either page/size or offset/limit, not both`,
    });
  }
  if (!usesOffset) return { page, size };
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new ValidationError({ message: `${method}: limit must be an integer ≥ 1` });
  }
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    throw new ValidationError({ message: `${method}: offset must be an integer ≥ 0` });
  }
  if (!offset) return { page: 0, size: limit };
  if (limit === undefined) {
    throw new ValidationError({
      message: `${method}: offset requires limit — Hepsiburada pages by number (pass \`limit\` to paginateOffset)`,
    });
  }
  if (offset % limit !== 0) {
    throw new ValidationError({
      message: `${method}: offset must be a multiple of limit — Hepsiburada pages by number`,
    });
  }
  return { page: offset / limit, size: limit };
}
