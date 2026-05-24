import { describe, expect, it, vi } from 'vitest';
import type { CursorPage, CursorPaginationParams } from './pagination.js';
import { paginate } from './pagination.js';

describe('paginate', () => {
  it('iterates a single page', async () => {
    const fetchPage = vi.fn(
      async (_p: CursorPaginationParams): Promise<CursorPage<number>> => ({
        items: [1, 2, 3],
      }),
    );
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
    const fetchPage = vi.fn(
      async (_p: CursorPaginationParams): Promise<CursorPage<number>> => ({ items: [] }),
    );
    for await (const _ of paginate(fetchPage, { limit: 50 })) {
      // no-op
    }
    expect(fetchPage).toHaveBeenCalledWith({ cursor: undefined, limit: 50 });
  });
});
