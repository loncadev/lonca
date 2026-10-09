/**
 * Just enough OpenAPI 3.0 typing and loading for drift detection.
 *
 * The `specs/` collection is a set of self-contained documents (no external
 * `$ref`s — see `specs/README.md`), one directory per marketplace. Documents
 * are identified by `<marketplace>/<file>.json`, e.g. `trendyol/product.json`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A JSON-Schema-ish node as it appears in an OpenAPI 3.0 document. Only the keywords drift reads are typed. */
export interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  nullable?: boolean;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  additionalProperties?: boolean | SchemaObject;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  /** Lonca annotation: property seen in production but absent from the upstream definition. */
  'x-lonca-observed'?: boolean;
  /** Lonca annotation: JSON types seen in production that contradict the documented `type`. */
  'x-lonca-observed-types'?: string[];
  [key: string]: unknown;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
}

export interface ResponseObject {
  $ref?: string;
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface OperationObject {
  operationId?: string;
  responses?: Record<string, ResponseObject>;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi?: string;
  servers?: { url: string }[];
  paths?: Record<string, Record<string, OperationObject | unknown>>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

/** One loaded spec file. */
export interface SpecFile {
  /** `<marketplace>/<file>.json`, e.g. `trendyol/marketplace.json`. */
  id: string;
  marketplace: string;
  document: OpenApiDocument;
}

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Load every OpenAPI document under `specsDir/<marketplace>/*.json`
 * (`manifest.json` excluded). Sorted by id so iteration order is stable.
 */
export function loadSpecs(specsDir: string, marketplaces?: readonly string[]): SpecFile[] {
  const out: SpecFile[] = [];
  for (const marketplace of readdirSync(specsDir).sort()) {
    const dir = join(specsDir, marketplace);
    if (!statSync(dir).isDirectory()) continue;
    if (marketplaces && !marketplaces.includes(marketplace)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.json') || file === 'manifest.json') continue;
      const document = JSON.parse(readFileSync(join(dir, file), 'utf8')) as OpenApiDocument;
      out.push({ id: `${marketplace}/${file}`, marketplace, document });
    }
  }
  return out;
}

/**
 * Resolve a local JSON pointer (`#/components/schemas/Foo`). Returns
 * `undefined` for external references or pointers that lead nowhere.
 */
export function resolveRef<T = unknown>(document: OpenApiDocument, ref: string): T | undefined {
  if (!ref.startsWith('#')) return undefined;
  const tokens = ref
    .slice(1)
    .split('/')
    .filter((t) => t !== '')
    .map((t) => decodeURIComponent(t).replace(/~1/g, '/').replace(/~0/g, '~'));
  let node: unknown = document;
  for (const token of tokens) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node as T | undefined;
}

/** Look up an operation object by spec path and (case-insensitive) method. */
export function getOperation(
  document: OpenApiDocument,
  specPath: string,
  method: string,
): OperationObject | undefined {
  const lower = method.toLowerCase();
  if (!HTTP_METHODS.includes(lower)) return undefined;
  const op = document.paths?.[specPath]?.[lower];
  return op && typeof op === 'object' ? (op as OperationObject) : undefined;
}

/** Result of picking the documented JSON response schema for a status code. */
export type ResponseSchemaLookup =
  | { found: true; schema: SchemaObject; statusKey: string; mediaType: string }
  | { found: false; reason: string };

/**
 * Find the documented JSON response schema for `status`: the exact code
 * first, then the `2XX` range. `default` is not used — in the specs it
 * describes error bodies. The media type preference is `application/json`,
 * then any `*json*` type, then `*\/*`.
 */
export function responseSchemaFor(
  document: OpenApiDocument,
  operation: OperationObject,
  status: number,
): ResponseSchemaLookup {
  const responses = operation.responses ?? {};
  const statusKey = [String(status), `${String(status)[0]}XX`, `${String(status)[0]}xx`].find(
    (k) => responses[k] !== undefined,
  );
  if (!statusKey) return { found: false, reason: `no documented response for HTTP ${status}` };
  let response = responses[statusKey]!;
  if (response.$ref) {
    const target = resolveRef<ResponseObject>(document, response.$ref);
    if (!target) return { found: false, reason: `unresolvable response $ref ${response.$ref}` };
    response = target;
  }
  const content = response.content ?? {};
  const mediaTypes = Object.keys(content);
  const mediaType =
    mediaTypes.find((m) => m.split(';')[0]!.trim().toLowerCase() === 'application/json') ??
    mediaTypes.find((m) => m.toLowerCase().includes('json')) ??
    mediaTypes.find((m) => m.trim() === '*/*');
  if (!mediaType) {
    return {
      found: false,
      reason: `HTTP ${statusKey} documents no JSON body${mediaTypes.length ? ` (only ${mediaTypes.join(', ')})` : ''}`,
    };
  }
  const schema = content[mediaType]!.schema;
  if (!schema) return { found: false, reason: `HTTP ${statusKey} ${mediaType} has no schema` };
  return { found: true, schema, statusKey, mediaType };
}
