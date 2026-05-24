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
