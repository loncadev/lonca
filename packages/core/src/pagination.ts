export interface CursorPaginationParams {
  /** Opaque cursor from previous response's `nextCursor`. Omit for the first page. */
  cursor?: string;
  /** Maximum items in the page. Marketplace SDKs may clamp this to their own bounds. */
  limit?: number;
}

export interface CursorPage<T> {
  items: T[];
  /** Opaque cursor for the next page. Absent when there are no more pages. */
  nextCursor?: string;
}

/**
 * Drive a cursor-paginated endpoint as an async iterator.
 *
 * @example
 * for await (const order of paginate((p) => client.orders.list(p))) {
 *   console.log(order.id);
 * }
 */
export async function* paginate<T>(
  fetchPage: (params: CursorPaginationParams) => Promise<CursorPage<T>>,
  params: Omit<CursorPaginationParams, 'cursor'> = {},
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage({ ...params, cursor });
    for (const item of page.items) {
      yield item;
    }
    cursor = page.nextCursor;
  } while (cursor);
}

// ─── Offset pagination ─────────────────────────────────────────────────────

export interface OffsetPaginationParams {
  /** Zero-based offset. Default depends on the SDK; usually `0`. */
  offset?: number;
  /** Maximum items in the page. */
  limit?: number;
}

/**
 * Offset-based pagination envelope returned by marketplaces that expose
 * `{ totalCount, limit, offset, pageCount, items[] }` instead of opaque
 * cursors. Hepsiburada's OMS uses this shape; some legacy Trendyol
 * endpoints do too. Distinct from `CursorPage<T>` so callers can tell at
 * the type level which pagination model an endpoint uses.
 */
export interface OffsetPage<T> {
  /** Total number of items matching the query across all pages. */
  totalCount: number;
  /** Echo of the request `limit`. */
  limit: number;
  /** Echo of the request `offset`. */
  offset: number;
  /** Total number of pages at the requested `limit`. */
  pageCount: number;
  /** Page rows. */
  items: T[];
}

/**
 * Drive an offset-paginated endpoint as an async iterator. Stops when the
 * server's `pageCount` is exhausted (or after the configured `maxPages`
 * to bound runaway iteration). Default page size is whatever the
 * underlying endpoint clamps to — pass `limit` explicitly for control.
 *
 * @example
 * for await (const order of paginateOffset((p) =>
 *   client.orders.list(p),
 * )) {
 *   console.log(order.orderNumber);
 * }
 */
export async function* paginateOffset<T>(
  fetchPage: (params: OffsetPaginationParams) => Promise<OffsetPage<T>>,
  params: { limit?: number; maxPages?: number } = {},
): AsyncGenerator<T, void, undefined> {
  const limit = params.limit;
  const maxPages = params.maxPages ?? Infinity;
  let offset = 0;
  let pages = 0;
  while (pages < maxPages) {
    const page = await fetchPage({ offset, limit });
    for (const item of page.items) {
      yield item;
    }
    pages += 1;
    if (page.items.length === 0) return;
    if (page.pageCount > 0 && pages >= page.pageCount) return;
    // Step by the server-echoed limit (when present) so requests stay aligned with how
    // the server batches; fall back to the caller's `limit` or the observed batch size.
    offset += page.limit || limit || page.items.length;
  }
}
