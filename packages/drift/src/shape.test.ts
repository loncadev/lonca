import { describe as suite, expect, it } from 'vitest';
import { describe, diffShapes, mergeShapes, summarize } from './shape.js';

suite('summarize', () => {
  it('reduces values to key sets and JSON types', () => {
    expect(
      summarize({
        name: 'Ayşe',
        n: 1,
        big: 10n,
        ok: true,
        nil: null,
        when: new Date(0),
        skip: undefined,
        fn: () => 1,
      }),
    ).toEqual({
      types: ['object'],
      keys: {
        big: { types: ['number'] },
        n: { types: ['number'] },
        name: { types: ['string'] },
        nil: { types: ['null'] },
        ok: { types: ['boolean'] },
        when: { types: ['string'] },
      },
    });
    expect(summarize(Symbol('x'))).toEqual({ types: ['null'] });
  });

  it('merges array elements and leaves empty arrays without items', () => {
    expect(summarize([{ a: 1 }, { a: null, b: 'x' }])).toEqual({
      types: ['array'],
      items: {
        types: ['object'],
        keys: { a: { types: ['null', 'number'] }, b: { types: ['string'] } },
      },
    });
    expect(summarize([])).toEqual({ types: ['array'] });
  });

  it('applies the depth and key caps', () => {
    expect(summarize({ a: { b: [1] } }, { maxDepth: 1, maxKeys: 80 })).toEqual({
      types: ['object'],
      keys: { a: { types: ['object'], depthCapped: true } },
    });
    expect(summarize([[1]], { maxDepth: 1, maxKeys: 80 })).toEqual({
      types: ['array'],
      items: { types: ['array'], depthCapped: true },
    });
    expect(summarize({ c: 1, a: 1, b: 1 }, { maxDepth: 6, maxKeys: 2 })).toEqual({
      types: ['object'],
      keys: { a: { types: ['number'] }, b: { types: ['number'] } },
      droppedKeys: 1,
    });
  });
});

suite('mergeShapes', () => {
  it('unions types, keys, items and caps', () => {
    expect(
      mergeShapes(
        { types: ['array'], items: { types: ['number'] }, droppedKeys: 2 },
        { types: ['null'], depthCapped: true },
      ),
    ).toEqual({
      types: ['array', 'null'],
      items: { types: ['number'] },
      droppedKeys: 2,
      depthCapped: true,
    });
    expect(
      mergeShapes({ types: ['array'] }, { types: ['array'], items: { types: ['string'] } }),
    ).toEqual({
      types: ['array'],
      items: { types: ['string'] },
    });
  });
});

suite('diffShapes', () => {
  it('reports added, removed, type changes and nullability', () => {
    const before = summarize({ a: 'x', b: 1, gone: true });
    const after = summarize({ a: 1, b: 1, added: [] });
    expect(diffShapes(before, after)).toEqual([
      { path: '$.a', kind: 'type-changed', from: 'string', to: 'number' },
      { path: '$.added', kind: 'added', to: 'array<empty>' },
      { path: '$.gone', kind: 'removed', from: 'boolean' },
    ]);
    expect(diffShapes(summarize({ n: 'y' }), summarize({ n: null }))).toEqual([
      { path: '$.n', kind: 'type-changed', from: 'string', to: 'null' },
    ]);
    expect(diffShapes({ types: ['string'] }, { types: ['null', 'string'] })).toEqual([
      { path: '$', kind: 'nullability', from: 'string', to: 'null|string' },
    ]);
    expect(diffShapes(undefined, undefined)).toEqual([]);
    expect(diffShapes(summarize([{ a: 1 }]), summarize([{ a: '1' }]))).toEqual([
      { path: '$[].a', kind: 'type-changed', from: 'number', to: 'string' },
    ]);
  });
});

suite('describe', () => {
  it('renders a one-line summary', () => {
    expect(describe(summarize([{ a: 1 }]))).toBe('array<object{1}>');
    expect(describe({ types: ['object'] })).toBe('object{?}');
    expect(describe({ types: ['null', 'string'] })).toBe('null|string');
  });
});
