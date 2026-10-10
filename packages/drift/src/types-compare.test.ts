import { describe, expect, it } from 'vitest';
import { displayPath, normalizeSchema, type Finding } from './engine.js';
import type { OpenApiDocument, SchemaObject } from './openapi.js';
import type { Shape } from './shape.js';
import {
  appendPath,
  compareSdkType,
  schemaAt,
  shapeAt,
  type CompareSdkInput,
} from './types-compare.js';
import type { SdkJsonType, SdkTypeNode } from './types-extract.js';

const document: OpenApiDocument = {
  components: {
    schemas: {
      Money: {
        type: 'object',
        properties: { amount: { type: 'number' }, currency: { type: 'string' } },
      },
    },
  },
};

const t = (...types: SdkJsonType[]): SdkTypeNode => ({ types });
const obj = (
  properties: Record<string, SdkTypeNode>,
  extra: Partial<SdkTypeNode> = {},
): SdkTypeNode => ({
  types: ['object'],
  properties: Object.fromEntries(
    Object.entries(properties).map(([k, type]) => [k, { optional: true, type }]),
  ),
  ...extra,
});
const arr = (items: SdkTypeNode): SdkTypeNode => ({ types: ['array'], items });
const S = (types: Shape['types'], extra: Partial<Shape> = {}): Shape => ({ types, ...extra });

function run(
  node: SdkTypeNode,
  schema: SchemaObject,
  over: Partial<CompareSdkInput> = {},
): Finding[] {
  return compareSdkType({
    node,
    sdkType: 'Item',
    spec: normalizeSchema(schema, document),
    document,
    path: '',
    wireBaseline: false,
    ...over,
  }).findings;
}

const kinds = (findings: Finding[]): string[] =>
  findings.map((f) => `${f.kind}:${f.severity}@${displayPath(f.path)}`);

describe('appendPath / schemaAt / shapeAt', () => {
  it('joins body paths', () => {
    expect(appendPath('', 'a')).toBe('a');
    expect(appendPath('content[]', '')).toBe('content[]');
    expect(appendPath('content[]', 'a.b')).toBe('content[].a.b');
    expect(appendPath('data', '[].a')).toBe('data[].a');
  });

  it('follows pointers through schemas and shapes', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        content: { type: 'array', items: { $ref: '#/components/schemas/Money' } },
        extra: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
    };
    const root = normalizeSchema(schema, document);
    expect(schemaAt(root, '(root)', document)).toBe(root);
    expect([...schemaAt(root, 'content[]', document)!.props.keys()]).toEqual([
      'amount',
      'currency',
    ]);
    expect(schemaAt(root, 'extra.anything[]', document)!.types).toEqual(new Set(['string']));
    expect(schemaAt(root, 'nope', document)).toBeUndefined();
    expect(schemaAt(root, 'content[].amount[]', document)).toBeUndefined();
    expect(schemaAt(root, 'a..b', document)).toBeUndefined();

    const shape = S(['object'], {
      keys: { content: S(['array'], { items: S(['object'], { keys: { a: S(['string']) } }) }) },
    });
    expect(shapeAt(shape, 'content[].a')).toEqual(S(['string']));
    expect(shapeAt(shape, '(root)')).toBe(shape);
    expect(shapeAt(shape, 'nope[]')).toBeUndefined();
    expect(shapeAt(undefined, 'a')).toBeUndefined();
  });
});

describe('compareSdkType — types', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string', nullable: true },
      amount: { $ref: '#/components/schemas/Money' },
      code: { type: 'string', 'x-lonca-observed-types': ['number'] },
      free: {},
    },
  };

  it('accepts matching, null-only-extra, narrower and unconstrained types', () => {
    const node = obj({
      id: t('number'),
      name: t('null', 'string'),
      amount: obj({ amount: t('number'), currency: t('string') }),
      code: t('string'),
      free: t('boolean'),
    });
    expect(run(node, schema)).toEqual([]);
    expect(run(obj({ id: t('null', 'number'), name: t('string') }), schema)).toEqual(
      run(obj({ id: t('number'), name: t('string') }), schema),
    );
    expect(kinds(run(obj({ id: t('any') }), schema))).toEqual(['sdk-missing-field:info@(root)']);
  });

  it('warns when the SDK and documented types do not overlap, with the wire as evidence', () => {
    const findings = run(obj({ id: t('string'), amount: t('number') }), schema, {
      path: 'items[]',
      wireBaseline: true,
      wire: S(['object'], { keys: { amount: S(['object']) } }),
    });
    expect(kinds(findings)).toEqual([
      'sdk-missing-field:info@items[]',
      'sdk-type-mismatch:warning@items[].amount',
      'sdk-type-mismatch:warning@items[].id',
    ]);
    expect(findings[0]!.fields).toEqual(['code', 'free', 'name']);
    expect(findings[1]).toMatchObject({
      sdkPath: 'Item.amount',
      sdk: ['number'],
      documented: ['object'],
      wire: ['object'],
      message: 'SDK declares number where the spec documents object; wire baseline: object',
    });
    expect(findings[2]).toMatchObject({
      wire: [],
      message: expect.stringContaining('not in the wire baseline'),
    });
  });

  it('reports a wider SDK type as info and an x-lonca-observed type as known', () => {
    const findings = run(obj({ id: t('number', 'string'), code: t('number', 'string') }), schema);
    expect(kinds(findings)).toEqual([
      'sdk-missing-field:info@(root)',
      'known:info@code',
      'sdk-type-mismatch:info@id',
    ]);
    expect(findings[2]!.message).toBe(
      'SDK declares number|string where the spec documents number (the SDK type is wider); no wire baseline for this operation',
    );
    expect(findings[2]!.wire).toBeUndefined();
  });

  it('skips coerced and ignored paths', () => {
    const node = obj({
      id: t('string'),
      raw: obj({}, { indexSignature: true }),
      lines: arr(obj({ raw: t('any'), y: t('string') })),
    });
    const s: SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        lines: {
          type: 'array',
          items: { type: 'object', properties: { x: {}, y: { type: 'string' } } },
        },
      },
    };
    expect(kinds(run(node, s, { coerced: ['id'], ignore: ['raw', 'lines[].raw'] }))).toEqual([
      'sdk-missing-field:info@lines[]',
    ]);
  });

  it('checks the mapped position itself', () => {
    const findings = run(
      { types: ['array', 'object'], items: t('string') },
      { type: 'array', items: { type: 'string' } },
      {
        wireBaseline: true,
        wire: S(['object']),
      },
    );
    expect(kinds(findings)).toEqual(['sdk-type-mismatch:info@(root)']);
    expect(findings[0]!.wire).toEqual(['object']);
  });
});

describe('compareSdkType — fields', () => {
  const schema: SchemaObject = {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'string', 'x-lonca-observed': true } },
  };

  it('grades unknown fields by the wire evidence', () => {
    const node = obj({ a: t('string'), b: t('string'), seen: t('string'), unseen: t('string') });
    const withWire = run(node, schema, {
      wireBaseline: true,
      wire: S(['object'], { keys: { a: S(['string']), seen: S(['number']) } }),
    });
    expect(kinds(withWire)).toEqual([
      'sdk-unknown-field:info@seen',
      'sdk-unknown-field:warning@unseen',
    ]);
    expect(withWire[0]).toMatchObject({ wire: ['number'], sdkPath: 'Item.seen' });
    expect(withWire[0]!.message).toContain('but the wire baseline has it (number)');
    expect(withWire[1]).toMatchObject({ wire: [] });
    expect(withWire[1]!.message).toContain('the wire baseline does not have it either');

    const noSample = run(node, schema, { wireBaseline: true });
    expect(noSample[1]!.message).toContain('no sample of the enclosing object');
    expect(noSample[1]!.wire).toBeUndefined();
    expect(run(node, schema)[1]!.message).toContain('no wire baseline for this operation');
  });

  it('uses additionalProperties for keys the schema does not list', () => {
    expect(run(obj({ z: t('string') }), { type: 'object', additionalProperties: true })).toEqual(
      [],
    );
    expect(
      kinds(
        run(obj({ z: t('string') }), { type: 'object', additionalProperties: { type: 'number' } }),
      ),
    ).toEqual(['sdk-type-mismatch:warning@z']);
  });

  it('reports objects the spec does not describe as uncomparable', () => {
    expect(kinds(run(obj({ z: t('string') }), { type: 'object' }))).toEqual([
      'uncomparable:info@(root)',
    ]);
    expect(run(obj({ z: t('string') }), { type: 'object' })[0]!.message).toContain(
      '1 SDK property',
    );
    expect(kinds(run(obj({ y: t('string'), z: t('string') }), {}))).toEqual([
      'uncomparable:info@(root)',
    ]);
    // free-form SDK objects and objects with only ignored properties have nothing to compare
    expect(run(obj({}, { indexSignature: true }), { type: 'object' })).toEqual([]);
    expect(run(obj({ raw: t('any') }), { type: 'object' }, { ignore: ['raw'] })).toEqual([]);
  });

  it('descends into arrays, and reports arrays without a documented element type', () => {
    const node = obj({ list: arr(obj({ a: t('number') })) });
    const findings = run(node, {
      type: 'object',
      properties: {
        list: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } },
      },
    });
    expect(kinds(findings)).toEqual(['sdk-type-mismatch:warning@list[].a']);
    expect(findings[0]!.sdkPath).toBe('Item.list[].a');
    expect(kinds(run(node, { type: 'object', properties: { list: { type: 'array' } } }))).toEqual([
      'uncomparable:info@list[]',
    ]);
    // an unconstrained position has no element type to compare and is not reported
    expect(run(node, { type: 'object', properties: { list: {} } })).toEqual([]);
    expect(kinds(run(arr(t('string')), { type: 'array', items: { type: 'string' } }))).toEqual([]);
  });

  it('does not descend where the documented type rules the SDK shape out', () => {
    const node = obj({ a: obj({ x: t('string') }), b: arr(t('string')) });
    expect(
      kinds(
        run(node, { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } }),
      ),
    ).toEqual(['sdk-type-mismatch:warning@a', 'sdk-type-mismatch:warning@b']);
  });

  it('stops at truncated SDK nodes', () => {
    const s: SchemaObject = {
      type: 'object',
      properties: { next: { type: 'object', properties: { a: {} } } },
    };
    expect(run(obj({ next: { types: ['object'], name: 'Item', truncated: 'cycle' } }), s)).toEqual(
      [],
    );
    expect(
      kinds(run(obj({ next: { types: ['object'], name: 'Deep', truncated: 'depth' } }), s)),
    ).toEqual(['uncomparable:info@next']);
  });

  it('names root-array SDK paths without a dot', () => {
    const findings = run(arr(obj({ q: t('string') })), {
      type: 'array',
      items: { type: 'object', properties: { p: {} } },
    });
    expect(findings.find((f) => f.kind === 'sdk-unknown-field')).toMatchObject({
      path: '[].q',
      sdkPath: 'Item[].q',
    });
  });

  it('counts the SDK properties matched with a documented property', () => {
    const result = compareSdkType({
      node: obj({ a: t('string'), b: t('string'), c: t('string') }),
      sdkType: 'Item',
      spec: normalizeSchema(schema, document),
      document,
      path: '',
      wireBaseline: false,
    });
    expect(result.compared).toBe(2);
  });
});
