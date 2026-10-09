import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getOperation,
  loadSpecs,
  resolveRef,
  responseSchemaFor,
  type MediaTypeObject,
  type OpenApiDocument,
} from './openapi.js';

const SPECS_DIR = fileURLToPath(new URL('../../../specs', import.meta.url));

describe('loadSpecs', () => {
  it('loads every spec of the real collection, skipping manifests, keyed by marketplace/file', () => {
    const specs = loadSpecs(SPECS_DIR);
    const ids = specs.map((s) => s.id);
    expect(ids).toContain('trendyol/marketplace.json');
    expect(ids).toContain('hepsiburada/oms-external.json');
    expect(ids.some((id) => id.endsWith('manifest.json'))).toBe(false);
    expect([...ids].sort()).toEqual(ids);
  });

  it('filters by marketplace', () => {
    const specs = loadSpecs(SPECS_DIR, ['hepsiburada']);
    expect(new Set(specs.map((s) => s.marketplace))).toEqual(new Set(['hepsiburada']));
  });
});

describe('resolveRef / getOperation', () => {
  const doc: OpenApiDocument = {
    paths: { '/a': { get: { operationId: 'getA' }, parameters: [] } },
    components: { schemas: { 'x/y': { type: 'string' }, 'p%q': { type: 'number' } } },
  };

  it('resolves local pointers and returns undefined for anything else', () => {
    expect(resolveRef(doc, '#/components/schemas/x~1y')).toEqual({ type: 'string' });
    expect(resolveRef(doc, '#/components/schemas/p%25q')).toEqual({ type: 'number' });
    expect(resolveRef(doc, '#/components/schemas/missing/deeper')).toBeUndefined();
    expect(resolveRef(doc, 'other.json#/x')).toBeUndefined();
  });

  it('looks up operations case-insensitively and ignores non-operation keys', () => {
    expect(getOperation(doc, '/a', 'GET')?.operationId).toBe('getA');
    expect(getOperation(doc, '/a', 'parameters')).toBeUndefined();
    expect(getOperation(doc, '/missing', 'get')).toBeUndefined();
  });
});

describe('responseSchemaFor', () => {
  const schema = { type: 'object' };
  const doc: OpenApiDocument = {};

  it('prefers the exact status, then the 2XX range', () => {
    const op = {
      responses: {
        '200': { content: { 'application/json': { schema } } },
        '2XX': { content: { 'application/json': { schema: { type: 'array' } } } },
      },
    };
    expect(responseSchemaFor(doc, op, 200)).toMatchObject({
      found: true,
      statusKey: '200',
      schema,
    });
    expect(responseSchemaFor(doc, op, 201)).toMatchObject({ found: true, statusKey: '2XX' });
    expect(
      responseSchemaFor(
        doc,
        { responses: { '2xx': { content: { 'application/json': { schema } } } } },
        204,
      ),
    ).toMatchObject({
      statusKey: '2xx',
    });
    expect(
      responseSchemaFor(
        doc,
        { responses: { default: { content: { 'application/json': { schema } } } } },
        200,
      ),
    ).toEqual({
      found: false,
      reason: 'no documented response for HTTP 200',
    });
    expect(responseSchemaFor(doc, {}, 200)).toMatchObject({ found: false });
  });

  it('prefers application/json, then any json media type, then */*', () => {
    const pick = (content: Record<string, MediaTypeObject>) =>
      responseSchemaFor(doc, { responses: { '200': { content } } }, 200);
    expect(
      pick({ 'text/plain': { schema }, 'application/json; charset=utf-8': { schema } }),
    ).toMatchObject({
      mediaType: 'application/json; charset=utf-8',
    });
    expect(pick({ '*/*': { schema }, 'text/json': { schema } })).toMatchObject({
      mediaType: 'text/json',
    });
    expect(pick({ '*/*': { schema } })).toMatchObject({ mediaType: '*/*' });
  });
});
