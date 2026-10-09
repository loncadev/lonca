/**
 * SDK type ↔ spec comparison for `pnpm drift:types` (roadmap 4.3).
 *
 * Compares one extracted {@link SdkTypeNode} with the documented schema at the
 * position it is mapped to. Pure functions, no I/O. The schema side uses the
 * wire engine's normalisation (`$ref` / `allOf` / `oneOf` / `anyOf`,
 * `nullable`, `x-lonca-observed*`), and the prod wire baseline at the same
 * position, when there is one, is attached to every finding as evidence of
 * which side is right.
 *
 * - `sdk-type-mismatch` — the SDK declares a non-null JSON type the spec does
 *   not allow. **warning** when the SDK type and the documented type do not
 *   overlap at all (`amount?: number` where an object is documented); **info**
 *   when the SDK is merely wider (`id?: number | string` where `integer` is
 *   documented); `known` (info) when `x-lonca-observed-types` already records
 *   the SDK's type. SDK `null` the spec does not allow is never reported —
 *   being more defensive than the docs is harmless in a response type — and
 *   neither are SDK types narrower than the spec. Paths listed as `coerced` in
 *   the map are not type-checked.
 * - `sdk-unknown-field` — an SDK property the schema does not document.
 *   **info** when the wire baseline has the key (the docs are incomplete),
 *   **warning** otherwise (the SDK may read a field that never arrives).
 * - `sdk-missing-field` — documented properties the SDK type does not declare:
 *   one collapsed **info** entry per object, with the names in `fields`.
 * - `uncomparable` — the spec documents no properties / element type to
 *   compare with, or the SDK type hit the depth cap.
 */
import {
  finding,
  normalizeSchema,
  type Finding,
  type NormalizedSchema,
  type Severity,
} from './engine.js';
import type { OpenApiDocument } from './openapi.js';
import { describe, type JsonType, type Shape } from './shape.js';
import type { SdkTypeNode } from './types-extract.js';
import { parsePath } from './types-map.js';

export interface CompareSdkInput {
  /** The extracted SDK type. */
  node: SdkTypeNode;
  /** Name shown in `sdkPath` (the mapped `sdkType`). */
  sdkType: string;
  /** The documented schema at the mapped position, normalised. */
  spec: NormalizedSchema;
  document: OpenApiDocument;
  /** Body path of the mapped position (`''` for the body itself). */
  path: string;
  /** Whether the operation has a wire baseline at all. */
  wireBaseline: boolean;
  /** Merged wire shape at the mapped position (`undefined` = not in the baseline). */
  wire?: Shape;
  /** SDK property paths (relative to the type) to skip entirely. */
  ignore?: readonly string[];
  /** SDK property paths whose JSON type the normaliser deliberately converts. */
  coerced?: readonly string[];
}

export interface CompareSdkResult {
  /** Sorted by path, then kind. */
  findings: Finding[];
  /** Number of SDK properties matched with a documented property. */
  compared: number;
}

interface Ctx {
  input: CompareSdkInput;
  ignore: Set<string>;
  coerced: Set<string>;
  out: Finding[];
  compared: number;
}

/** Append a relative path (`a.b`, `[].c`, `[]`) to a body path. */
export function appendPath(base: string, rel: string): string {
  if (!rel) return base;
  if (!base) return rel;
  return rel.startsWith('[') ? `${base}${rel}` : `${base}.${rel}`;
}

function child(rel: string, name: string): string {
  return rel ? `${rel}.${name}` : name;
}

/** Follow a pointer (`content[].lines[]`) through a normalised schema; `undefined` when it leads nowhere. */
export function schemaAt(
  root: NormalizedSchema,
  pointer: string,
  document: OpenApiDocument,
): NormalizedSchema | undefined {
  const steps = parsePath(pointer);
  if (!steps) return undefined;
  let norm = root;
  for (const step of steps) {
    if (step.name !== undefined) {
      const documented = norm.props.get(step.name);
      if (documented) norm = normalizeSchema(documented, document);
      else if (Array.isArray(norm.additional)) norm = normalizeSchema(norm.additional, document);
      else return undefined;
    }
    for (let i = 0; i < step.arrays; i++) {
      if (!norm.items.length) return undefined;
      norm = normalizeSchema(norm.items, document);
    }
  }
  return norm;
}

/** Follow a pointer through a wire shape; `undefined` when the baseline has nothing there. */
export function shapeAt(root: Shape | undefined, pointer: string): Shape | undefined {
  let shape = root;
  for (const step of parsePath(pointer) ?? []) {
    if (step.name !== undefined) shape = shape?.keys?.[step.name];
    for (let i = 0; i < step.arrays; i++) shape = shape?.items;
  }
  return shape;
}

export function compareSdkType(input: CompareSdkInput): CompareSdkResult {
  const ctx: Ctx = {
    input,
    ignore: new Set(input.ignore ?? []),
    coerced: new Set(input.coerced ?? []),
    out: [],
    compared: 0,
  };
  walk(input.node, input.spec, input.wire, '', ctx);
  const findings = ctx.out.sort(
    (a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind),
  );
  return { findings, compared: ctx.compared };
}

function sdkPathOf(rel: string, ctx: Ctx): string {
  const { sdkType } = ctx.input;
  if (!rel) return sdkType;
  return rel.startsWith('[') ? `${sdkType}${rel}` : `${sdkType}.${rel}`;
}

function emit(
  ctx: Ctx,
  kind: Finding['kind'],
  rel: string,
  message: string,
  extra: Partial<Finding> = {},
): void {
  const f = finding(kind, appendPath(ctx.input.path, rel), message, {
    sdkPath: sdkPathOf(rel, ctx),
    ...extra,
  });
  ctx.out.push(extra.severity ? { ...f, severity: extra.severity } : f);
}

function wireEvidence(wire: Shape | undefined, ctx: Ctx): { text: string; wire?: JsonType[] } {
  if (!ctx.input.wireBaseline) return { text: 'no wire baseline for this operation' };
  if (!wire) return { text: 'not in the wire baseline', wire: [] };
  return { text: `wire baseline: ${wire.types.join('|')}`, wire: wire.types };
}

function walk(
  sdk: SdkTypeNode,
  spec: NormalizedSchema,
  wire: Shape | undefined,
  rel: string,
  ctx: Ctx,
): void {
  if (ctx.ignore.has(rel)) return;
  checkType(sdk, spec, wire, rel, ctx);
  const allowed = spec.types;
  if (sdk.types.includes('object') && (!allowed || allowed.has('object'))) {
    walkObject(sdk, spec, wire, rel, ctx);
  }
  if (sdk.items && (!allowed || allowed.has('array'))) {
    if (!spec.items.length) {
      if (allowed?.has('array')) {
        emit(ctx, 'uncomparable', `${rel}[]`, 'the spec documents no element type for this array');
      }
      return;
    }
    walk(sdk.items, normalizeSchema(spec.items, ctx.input.document), wire?.items, `${rel}[]`, ctx);
  }
}

function checkType(
  sdk: SdkTypeNode,
  spec: NormalizedSchema,
  wire: Shape | undefined,
  rel: string,
  ctx: Ctx,
): void {
  const allowed = spec.types;
  if (!allowed || sdk.types.includes('any') || ctx.coerced.has(rel)) return;
  const declared = sdk.types.filter((t) => t !== 'null') as JsonType[];
  const extra = declared.filter((t) => !allowed.has(t));
  if (!extra.length) return;
  const documented = [...allowed].sort();
  const evidence = wireEvidence(wire, ctx);
  const base = {
    sdk: [...sdk.types],
    documented,
    ...(evidence.wire ? { wire: evidence.wire } : {}),
  };
  const what = `SDK declares ${sdk.types.join('|')} where the spec documents ${documented.join('|') || 'nothing'}`;
  if (extra.every((t) => spec.observedTypes.has(t))) {
    emit(ctx, 'known', rel, `${what} — already recorded as x-lonca-observed-types`, base);
    return;
  }
  const disjoint = declared.every((t) => !allowed.has(t));
  const severity: Severity = disjoint ? 'warning' : 'info';
  emit(
    ctx,
    'sdk-type-mismatch',
    rel,
    `${what}${disjoint ? '' : ' (the SDK type is wider)'}; ${evidence.text}`,
    { ...base, severity },
  );
}

function walkObject(
  sdk: SdkTypeNode,
  spec: NormalizedSchema,
  wire: Shape | undefined,
  rel: string,
  ctx: Ctx,
): void {
  if (sdk.truncated) {
    if (sdk.truncated === 'depth') {
      emit(ctx, 'uncomparable', rel, 'SDK type depth cap reached; nested properties not compared');
    }
    return;
  }
  const props = Object.entries(sdk.properties ?? {}).filter(
    ([name]) => !ctx.ignore.has(child(rel, name)),
  );
  if (!props.length) return; // free-form (`Record<string, unknown>`) or only ignored properties
  if (spec.props.size === 0 && spec.additional === undefined) {
    emit(
      ctx,
      'uncomparable',
      rel,
      `the spec declares no properties for this object (${props.length} SDK propert${props.length === 1 ? 'y' : 'ies'} not compared)`,
    );
    return;
  }
  for (const [name, prop] of props) {
    const childRel = child(rel, name);
    const childWire = wire?.keys?.[name];
    const documented = spec.props.get(name);
    if (documented) {
      ctx.compared += 1;
      walk(prop.type, normalizeSchema(documented, ctx.input.document), childWire, childRel, ctx);
    } else if (spec.additional === true) {
      // explicitly free-form keys
    } else if (spec.additional) {
      walk(
        prop.type,
        normalizeSchema(spec.additional, ctx.input.document),
        childWire,
        childRel,
        ctx,
      );
    } else if (childWire) {
      emit(
        ctx,
        'sdk-unknown-field',
        childRel,
        `SDK declares \`${name}\`; the spec does not document it, but the wire baseline has it (${describe(childWire)})`,
        { severity: 'info', wire: childWire.types },
      );
    } else {
      const evidence = !ctx.input.wireBaseline
        ? 'no wire baseline for this operation'
        : wire
          ? 'the wire baseline does not have it either'
          : 'the wire baseline has no sample of the enclosing object';
      emit(
        ctx,
        'sdk-unknown-field',
        childRel,
        `SDK declares \`${name}\`; the spec does not document it (${evidence})`,
        ctx.input.wireBaseline && wire ? { wire: [] } : {},
      );
    }
  }
  const declared = new Set(Object.keys(sdk.properties ?? {}));
  const missing = [...spec.props.keys()].filter((k) => !declared.has(k)).sort();
  if (missing.length) {
    emit(
      ctx,
      'sdk-missing-field',
      rel,
      `${missing.length} documented propert${missing.length === 1 ? 'y' : 'ies'} not declared by the SDK type`,
      { fields: missing },
    );
  }
}
