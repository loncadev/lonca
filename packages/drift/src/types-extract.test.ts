import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractSdkTypes, sdkTypeKey, type SdkTypeNode } from './types-extract.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'src/__fixtures__/sdk-types/sample.ts';

const NAMES = ['Sample', 'Level1', 'Alias', 'Intersected', 'Either', 'Box', 'Merged', 'Local'];
// One compiler program for every fixture type (creating a program is the slow part).
const ALL = extractSdkTypes(
  NAMES.map((name) => ({ source: SOURCE, name })),
  { rootDir: ROOT },
);

function extract(name: string, maxDepth?: number): SdkTypeNode {
  const result =
    maxDepth === undefined
      ? ALL
      : extractSdkTypes([{ source: SOURCE, name }], { rootDir: ROOT, maxDepth });
  expect(result.problems).toEqual([]);
  return result.nodes.get(sdkTypeKey({ source: SOURCE, name }))!;
}

const prop = (node: SdkTypeNode, name: string): SdkTypeNode => node.properties![name]!.type;

describe('extractSdkTypes', () => {
  const sample = extract('Sample');

  it('reduces primitives, literals, enums and open string unions to JSON types', () => {
    expect(sample.types).toEqual(['object']);
    expect(sample.name).toBe('Sample');
    expect(prop(sample, 'id').types).toEqual(['string']);
    expect(prop(sample, 'count').types).toEqual(['number']);
    expect(prop(sample, 'flag').types).toEqual(['boolean']);
    expect(prop(sample, 'status').types).toEqual(['string']);
    expect(prop(sample, 'level').types).toEqual(['number']);
    expect(prop(sample, 'color').types).toEqual(['string']);
    expect(prop(sample, 'maybe').types).toEqual(['null', 'string']);
    expect(prop(sample, 'anything').types).toEqual(['any']);
    expect(prop(sample, 'big').types).toEqual(['number']);
    expect(prop(sample, 'template').types).toEqual(['string']);
    expect(prop(sample, 'when').types).toEqual(['string']);
    expect(prop(sample, 'nothing').types).toEqual([]);
  });

  it('records optionality and drops methods and function-typed properties', () => {
    expect(sample.properties!.id!.optional).toBe(false);
    expect(sample.properties!.count!.optional).toBe(true);
    expect(sample.properties!.method).toBeUndefined();
    expect(sample.properties!.callback).toBeUndefined();
    expect(sample.indexSignature).toBe(true);
  });

  it('describes arrays, tuples and nested objects', () => {
    expect(prop(sample, 'tags')).toEqual({ types: ['array'], items: { types: ['string'] } });
    expect(prop(sample, 'pairs')).toEqual({ types: ['array'], items: { types: ['number'] } });
    expect(prop(sample, 'tuple')).toEqual({
      types: ['array'],
      items: { types: ['number', 'string'] },
    });
    const refs = prop(sample, 'refs');
    expect(refs.types).toEqual(['array']);
    expect(refs.items!.name).toBe('Ref');
    expect(prop(refs.items!, 'id').types).toEqual(['number', 'string']);
    expect(prop(sample, 'inline')).toEqual({
      types: ['object'],
      properties: {
        a: { optional: true, type: { types: ['string'] } },
        b: { optional: false, type: { types: ['number'] } },
      },
    });
  });

  it('merges union members and keeps free-form objects open', () => {
    const mixed = prop(sample, 'mixed');
    expect(mixed.types).toEqual(['object', 'string']);
    expect(Object.keys(mixed.properties!)).toEqual(['url']);
    expect(prop(sample, 'bag')).toEqual({ types: ['object'], indexSignature: true });
    expect(prop(sample, 'obj')).toEqual({ types: ['object'], indexSignature: true });
  });

  it('stops at a named type already on the path', () => {
    expect(prop(sample, 'child')).toEqual({
      types: ['object'],
      name: 'Sample',
      truncated: 'cycle',
    });
    expect(prop(sample, 'children').items).toMatchObject({ name: 'Sample', truncated: 'cycle' });
  });

  it('stops at the depth cap', () => {
    const level1 = extract('Level1', 1);
    expect(prop(level1, 'next')).toEqual({ types: ['object'], name: 'Level2', truncated: 'depth' });
    expect(prop(prop(extract('Level1'), 'next'), 'next').name).toBe('Level3');
  });

  it('handles aliases, intersections, discriminated unions, generics and merged interfaces', () => {
    const alias = extract('Alias');
    expect(alias.types).toEqual(['null', 'object']);
    expect(alias.name).toBe('Ref');
    const intersected = extract('Intersected');
    expect(intersected).toMatchObject({ types: ['object'], indexSignature: true });
    expect(Object.keys(intersected.properties!)).toEqual(['a']);
    const either = extract('Either');
    expect(either.properties!.kind).toEqual({ optional: false, type: { types: ['string'] } });
    // a property only one member declares is optional on the union
    expect(either.properties!.a!.optional).toBe(true);
    expect(either.properties!.b!.type.types).toEqual(['number']);
    expect(prop(extract('Box'), 'value').types).toEqual(['any']);
    expect(Object.keys(extract('Merged').properties!)).toEqual(['a', 'b']);
  });

  it('finds interfaces declared inside functions', () => {
    expect(prop(extract('Local'), 'x').types).toEqual(['number']);
  });

  it('lists the named types reached from each request', () => {
    expect(ALL.reached.get(sdkTypeKey({ source: SOURCE, name: 'Level1' }))).toEqual([
      `${SOURCE}#Level1`,
      `${SOURCE}#Level2`,
      `${SOURCE}#Level3`,
    ]);
  });

  it('reports missing files, unknown names and ambiguous declarations', () => {
    const result = extractSdkTypes(
      [
        { source: 'src/__fixtures__/sdk-types/missing.ts', name: 'X' },
        { source: SOURCE, name: 'Nope' },
        { source: SOURCE, name: 'Dup' },
      ],
      { rootDir: ROOT },
    );
    expect(result.problems).toEqual([
      'src/__fixtures__/sdk-types/missing.ts: file not found',
      `${SOURCE}: no interface or type alias named Nope`,
      `${SOURCE}: 2 declarations named Dup (ambiguous)`,
    ]);
    expect(result.nodes.size).toBe(0);
  });

  it('returns nothing when no source file exists', () => {
    const result = extractSdkTypes([{ source: 'nope.ts', name: 'X' }], { rootDir: ROOT });
    expect(result).toEqual({
      nodes: new Map(),
      reached: new Map(),
      problems: ['nope.ts: file not found'],
    });
  });
});
