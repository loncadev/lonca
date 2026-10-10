/**
 * SDK type extractor for `pnpm drift:types` (roadmap 4.3).
 *
 * Reads TypeScript interfaces / type aliases straight from the SDK sources
 * with the compiler API — the SDKs are never imported or executed — and
 * reduces each to an {@link SdkTypeNode}: property names, optionality and a
 * simplified JSON type set, recursively.
 *
 * Simplification rules:
 *
 * - `string`, string literals, template literals and enums of strings →
 *   `string`; numbers, number literals and numeric enums → `number`;
 *   `true` / `false` / `boolean` → `boolean`; `null` → `null`; `undefined` /
 *   `void` / `never` are dropped (optionality is tracked separately).
 * - `unknown`, `any`, type parameters and anything unrecognised → `any`
 *   (unconstrained: never compared).
 * - An intersection with a primitive member is that primitive
 *   (`(string & {})` → `string`); other intersections are merged objects.
 * - `T[]`, `readonly T[]`, `Array<T>` and tuples → `array` with the union of
 *   the element types as `items`; `Date` → `string` (as on the wire).
 * - Object types → `object` with their properties; an index signature
 *   (`[key: string]: unknown`, `Record<string, …>`) is recorded as
 *   `indexSignature` and allows extra keys. Members with call signatures
 *   only (methods) are dropped.
 * - Union members are merged: `{ url?: string } | string` is
 *   `object|string` with the object's properties.
 * - Recursion stops at a named type already on the path (`cycle`) or past
 *   `maxDepth` (`depth`); such nodes carry `truncated` and no children.
 */
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import type { JsonType } from './shape.js';

/** A JSON type, or `any` for an unconstrained position (`unknown`, `any`). */
export type SdkJsonType = JsonType | 'any';

export interface SdkProperty {
  optional: boolean;
  type: SdkTypeNode;
}

export interface SdkTypeNode {
  /** Sorted, de-duplicated JSON types the SDK allows here. */
  types: SdkJsonType[];
  /** Name of the interface / type alias this object node came from (`A|B` for a union of named types). */
  name?: string;
  /** Declared properties of the object member(s), sorted by name. */
  properties?: Record<string, SdkProperty>;
  /** The object declares an index signature, so keys beyond `properties` are allowed. */
  indexSignature?: true;
  /** Element type of the array member(s). */
  items?: SdkTypeNode;
  /** Children were not described: a named type repeated on the path (`cycle`) or the depth cap (`depth`). */
  truncated?: 'cycle' | 'depth';
}

/** One type to extract: an interface or type alias declared anywhere in `source`. */
export interface SdkTypeRequest {
  /** Source file, relative to `rootDir` (e.g. `sdks/trendyol/src/types/order.ts`). */
  source: string;
  /** Interface or type alias name; it may be declared inside a function. */
  name: string;
}

export interface ExtractOptions {
  /** Directory `source` paths are relative to (the repo root). */
  rootDir: string;
  /** Maximum nesting depth described below each requested type. Default 8. */
  maxDepth?: number;
}

export interface ExtractResult {
  /** Extracted nodes keyed by {@link sdkTypeKey}. */
  nodes: Map<string, SdkTypeNode>;
  /** Named types reached from each requested type (itself included), keyed like `nodes`. */
  reached: Map<string, string[]>;
  /** One line per request that could not be resolved. */
  problems: string[];
}

export const DEFAULT_MAX_TYPE_DEPTH = 8;

export function sdkTypeKey(request: SdkTypeRequest): string {
  return `${request.source}#${request.name}`;
}

/** Extract every requested type with one TypeScript program over their source files. */
export function extractSdkTypes(
  requests: readonly SdkTypeRequest[],
  options: ExtractOptions,
): ExtractResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_TYPE_DEPTH;
  const result: ExtractResult = { nodes: new Map(), reached: new Map(), problems: [] };
  const files = new Map<string, string>();
  for (const r of requests) {
    const abs = resolve(options.rootDir, r.source);
    if (!existsSync(abs)) {
      result.problems.push(`${r.source}: file not found`);
      continue;
    }
    files.set(r.source, abs);
  }
  if (!files.size) return result;

  const program = ts.createProgram([...new Set(files.values())], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    // No ambient @types: the response types under test never need them.
    types: [],
  });
  const checker = program.getTypeChecker();

  for (const r of requests) {
    const abs = files.get(r.source);
    if (!abs) continue;
    const sourceFile = program.getSourceFile(abs)!;
    const declarations = findDeclarations(sourceFile, r.name);
    if (declarations.length !== 1) {
      result.problems.push(
        declarations.length
          ? `${r.source}: ${declarations.length} declarations named ${r.name} (ambiguous)`
          : `${r.source}: no interface or type alias named ${r.name}`,
      );
      continue;
    }
    const reached = new Set<string>();
    const walker = new Walker(checker, maxDepth, options.rootDir, reached);
    const node = walker.convert(checker.getTypeAtLocation(declarations[0]!.name), 0, []);
    if (!node.name) node.name = r.name;
    result.nodes.set(sdkTypeKey(r), node);
    result.reached.set(sdkTypeKey(r), [...reached].sort());
  }
  return result;
}

function findDeclarations(
  sourceFile: ts.SourceFile,
  name: string,
): Array<ts.InterfaceDeclaration | ts.TypeAliasDeclaration> {
  const out: Array<ts.InterfaceDeclaration | ts.TypeAliasDeclaration> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.name.text === name
    ) {
      out.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  // Declaration merging (two `interface X` blocks in one scope) is one type, not an ambiguity.
  const scopes = new Set(out.map((d) => d.parent));
  return scopes.size === 1 ? out.slice(0, 1) : out;
}

type Bucket = { types: Set<SdkJsonType>; objects: ts.Type[]; arrays: ts.Type[] };

class Walker {
  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly maxDepth: number,
    private readonly rootDir: string,
    private readonly reached: Set<string>,
  ) {}

  convert(type: ts.Type, depth: number, stack: readonly string[]): SdkTypeNode {
    return this.convertMany([type], depth, stack);
  }

  private convertMany(
    types: readonly ts.Type[],
    depth: number,
    stack: readonly string[],
  ): SdkTypeNode {
    const bucket: Bucket = { types: new Set(), objects: [], arrays: [] };
    for (const t of types)
      for (const member of t.isUnion() ? t.types : [t]) this.classify(member, bucket);
    const node: SdkTypeNode = { types: [] };
    if (bucket.arrays.length) {
      bucket.types.add('array');
      const elements = bucket.arrays.flatMap((a) =>
        this.checker.getTypeArguments(a as ts.TypeReference),
      );
      node.items = elements.length
        ? this.convertMany(elements, depth + 1, stack)
        : { types: ['any'] };
    }
    if (bucket.objects.length) {
      bucket.types.add('object');
      this.describeObjects(bucket.objects, node, depth, stack);
    }
    node.types = [...bucket.types].sort();
    return node;
  }

  private classify(t: ts.Type, bucket: Bucket): void {
    const f = t.flags;
    if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) return;
    if (f & ts.TypeFlags.Null) bucket.types.add('null');
    else if (
      f &
      (ts.TypeFlags.String |
        ts.TypeFlags.StringLiteral |
        ts.TypeFlags.TemplateLiteral |
        ts.TypeFlags.StringMapping)
    ) {
      bucket.types.add('string');
    } else if (
      f &
      (ts.TypeFlags.Number |
        ts.TypeFlags.NumberLiteral |
        ts.TypeFlags.BigInt |
        ts.TypeFlags.BigIntLiteral)
    ) {
      bucket.types.add('number');
    } else if (f & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral))
      bucket.types.add('boolean');
    else if (t.isIntersection()) {
      const primitives: Bucket = { types: new Set(), objects: [], arrays: [] };
      for (const part of t.types) this.classify(part, primitives);
      const scalar = [...primitives.types].filter((x) => x !== 'any');
      if (scalar.length) for (const x of scalar) bucket.types.add(x);
      else bucket.objects.push(t);
    } else if (f & ts.TypeFlags.Object) {
      if (this.checker.isArrayType(t) || this.checker.isTupleType(t)) bucket.arrays.push(t);
      else if (t.symbol?.name === 'Date') bucket.types.add('string');
      else if (
        this.checker.getPropertiesOfType(t).length === 0 &&
        this.checker.getIndexInfosOfType(t).length === 0 &&
        t.getCallSignatures().length > 0
      ) {
        return; // a function type — not data
      } else bucket.objects.push(t);
    } else if (f & ts.TypeFlags.NonPrimitive) {
      bucket.objects.push(t); // `object`
    } else bucket.types.add('any');
  }

  private nameOf(t: ts.Type): string | undefined {
    const alias = t.aliasSymbol?.name;
    if (alias && alias !== 'Record' && alias !== 'Partial') return alias;
    const name = t.symbol?.name;
    return name && !name.startsWith('__') ? name : undefined;
  }

  private qualified(t: ts.Type, name: string): string {
    const declaration = (t.aliasSymbol ?? t.symbol)?.declarations?.[0];
    const file = declaration
      ? relative(this.rootDir, declaration.getSourceFile().fileName).replace(/\\/g, '/')
      : '?';
    return `${file}#${name}`;
  }

  private describeObjects(
    objects: readonly ts.Type[],
    node: SdkTypeNode,
    depth: number,
    stack: readonly string[],
  ): void {
    const names = [...new Set(objects.map((o) => this.nameOf(o)).filter((n) => n !== undefined))];
    if (names.length) node.name = names.join('|');
    for (const o of objects) {
      const name = this.nameOf(o);
      if (name) this.reached.add(this.qualified(o, name));
    }
    if (names.some((n) => stack.includes(n))) {
      node.truncated = 'cycle';
      return;
    }
    if (depth >= this.maxDepth) {
      node.truncated = 'depth';
      return;
    }
    const inner = [...stack, ...names];
    const collected = new Map<string, { optional: boolean; types: ts.Type[]; seen: number }>();
    for (const o of objects) {
      if (this.checker.getIndexInfosOfType(o).length || o.flags & ts.TypeFlags.NonPrimitive) {
        node.indexSignature = true;
      }
      for (const prop of this.checker.getPropertiesOfType(o)) {
        const propType = this.checker.getTypeOfSymbol(prop);
        if (isMethod(prop, this.checker.getNonNullableType(propType))) continue;
        const entry = collected.get(prop.name) ?? { optional: false, types: [], seen: 0 };
        entry.optional ||= (prop.flags & ts.SymbolFlags.Optional) !== 0;
        entry.types.push(propType);
        entry.seen += 1;
        collected.set(prop.name, entry);
      }
    }
    const properties: Record<string, SdkProperty> = {};
    for (const name of [...collected.keys()].sort()) {
      const entry = collected.get(name)!;
      properties[name] = {
        // A property only some union members declare is optional on the union.
        optional: entry.optional || entry.seen < objects.length,
        type: this.convertMany(entry.types, depth + 1, inner),
      };
    }
    if (Object.keys(properties).length) node.properties = properties;
  }
}

/** Methods and function-typed properties are behaviour, not data (`type` without `undefined` / `null`). */
function isMethod(prop: ts.Symbol, type: ts.Type): boolean {
  return (
    (prop.flags & ts.SymbolFlags.Method) !== 0 ||
    (type.getCallSignatures().length > 0 && type.getProperties().length === 0)
  );
}
