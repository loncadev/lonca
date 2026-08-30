import { describe, expect, it, vi } from 'vitest';
import type {
  CursorPage,
  CursorPaginationParams,
  OffsetPage,
  OffsetPaginationParams,
} from './pagination.js';
import { paginate, paginateOffset } from './pagination.js';

describe('paginate', () => {
  it('iterates a single page', async () => {
    const fetchPage = vi.fn(async (_p: CursorPaginationParams): Promise<CursorPage<number>> => ({
      items: [1, 2, 3],
    }));
    const out: number[] = [];
    for await (const n of paginate(fetchPage)) out.push(n);
    expect(out).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('follows nextCursor across pages', async () => {
    const pages: Record<string, CursorPage<number>> = {
      __first__: { items: [1, 2], nextCursor: 'c1' },
      c1: { items: [3, 4], nextCursor: 'c2' },
      c2: { items: [5] },
    };
    const fetchPage = vi.fn(async (p: CursorPaginationParams) => {
      const key = p.cursor ?? '__first__';
      const page = pages[key];
      if (!page) throw new Error(`unknown cursor ${key}`);
      return page;
    });
    const out: number[] = [];
    for await (const n of paginate(fetchPage)) out.push(n);
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('forwards extra params on every fetch', async () => {
    const fetchPage = vi.fn(async (_p: CursorPaginationParams): Promise<CursorPage<number>> => ({
      items: [],
    }));
    for await (const _ of paginate(fetchPage, { limit: 50 })) {
      // no-op
    }
    expect(fetchPage).toHaveBeenCalledWith({ cursor: undefined, limit: 50 });
  });
});

describe('paginateOffset', () => {
  /** Build an in-memory offset endpoint over `total` sequential items. */
  function makeEndpoint(total: number, serverLimit: number) {
    const all = Array.from({ length: total }, (_, i) => i + 1);
    return vi.fn(async (p: OffsetPaginationParams): Promise<OffsetPage<number>> => {
      const offset = p.offset ?? 0;
      const limit = p.limit ?? serverLimit;
      return {
        totalCount: total,
        limit,
        offset,
        pageCount: Math.ceil(total / limit),
        items: all.slice(offset, offset + limit),
      };
    });
  }

  it('walks every page and stops when pageCount is exhausted', async () => {
    const fetchPage = makeEndpoint(5, 2);
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage, { limit: 2 })) out.push(n);
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([p]) => p.offset)).toEqual([0, 2, 4]);
  });

  it('forwards the caller limit on every request', async () => {
    const fetchPage = makeEndpoint(4, 10);
    for await (const _ of paginateOffset(fetchPage, { limit: 2 })) {
      // no-op
    }
    expect(fetchPage).toHaveBeenCalledWith({ offset: 0, limit: 2 });
    expect(fetchPage).toHaveBeenCalledWith({ offset: 2, limit: 2 });
  });

  it('stops after a single call on an empty first page', async () => {
    const fetchPage = vi.fn(async (): Promise<OffsetPage<number>> => ({
      totalCount: 0,
      limit: 10,
      offset: 0,
      pageCount: 0,
      items: [],
    }));
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage)) out.push(n);
    expect(out).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops on the first empty page when the server never reports pageCount', async () => {
    const pages: number[][] = [[1, 2], [3], []];
    const fetchPage = vi.fn(async (p: OffsetPaginationParams): Promise<OffsetPage<number>> => ({
      totalCount: 3,
      limit: 2,
      offset: p.offset ?? 0,
      pageCount: 0,
      items: pages.shift() ?? [],
    }));
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage, { limit: 2 })) out.push(n);
    expect(out).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('caps runaway iteration at maxPages even when more pages exist', async () => {
    const fetchPage = makeEndpoint(100, 10);
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage, { limit: 10, maxPages: 2 })) out.push(n);
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('steps by the server-echoed limit when it disagrees with the caller limit', async () => {
    // Server clamps the requested limit of 50 down to 2 per page.
    const fetchPage = vi.fn(async (p: OffsetPaginationParams): Promise<OffsetPage<number>> => {
      const offset = p.offset ?? 0;
      const all = [1, 2, 3, 4];
      return {
        totalCount: 4,
        limit: 2,
        offset,
        pageCount: 2,
        items: all.slice(offset, offset + 2),
      };
    });
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage, { limit: 50 })) out.push(n);
    expect(out).toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls.map(([p]) => p.offset)).toEqual([0, 2]);
  });

  it('falls back to the observed batch size when neither limit is usable', async () => {
    const pages: number[][] = [
      [1, 2, 3],
      [4, 5],
    ];
    const offsets: (number | undefined)[] = [];
    const fetchPage = vi.fn(async (p: OffsetPaginationParams): Promise<OffsetPage<number>> => {
      offsets.push(p.offset);
      return {
        totalCount: 5,
        limit: 0,
        offset: p.offset ?? 0,
        pageCount: 2,
        items: pages.shift() ?? [],
      };
    });
    const out: number[] = [];
    for await (const n of paginateOffset(fetchPage)) out.push(n);
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(offsets).toEqual([0, 3]);
  });

  it('propagates a fetchPage rejection from a later page', async () => {
    const boom = new Error('page 2 exploded');
    const fetchPage = vi.fn(async (p: OffsetPaginationParams): Promise<OffsetPage<number>> => {
      if ((p.offset ?? 0) > 0) throw boom;
      return { totalCount: 4, limit: 2, offset: 0, pageCount: 2, items: [1, 2] };
    });
    const out: number[] = [];
    await expect(
      (async () => {
        for await (const n of paginateOffset(fetchPage, { limit: 2 })) out.push(n);
      })(),
    ).rejects.toBe(boom);
    expect(out).toEqual([1, 2]);
  });
});
