/**
 * Structural summariser for probe responses.
 *
 * A `Shape` describes *what a JSON value looks like* — the key set of every
 * object level and the JSON type(s) observed at each position — and never the
 * values themselves. That is what makes the snapshots safe to commit: customer
 * names, addresses, phone numbers, order numbers, prices and SKUs are all
 * reduced to `"string"` / `"number"` before anything leaves the process.
 *
 * Arrays are summarised by merging the shapes of all their elements (union of
 * keys, union of types), so `[{a:1},{a:null,b:'x'}]` becomes
 * `{ types:['array'], items:{ types:['object'], keys:{ a:{types:['null','number']}, b:{types:['string']} } } }`.
 * Element counts are deliberately *not* recorded — they change run to run and
 * would only add noise to the drift diff.
 *
 * Shapes are sample-dependent: an array that happens to be empty has no
 * `items`. When the probe runner rewrites a baseline it keeps the previous
 * element shape at such positions ({@link carryEmptyArrayItems}), marked
 * `itemsFromBaseline: true`, so an empty page does not erase a known shape.
 *
 * Moved here from `scripts/probe/shape.mts` so the probe runner (which writes
 * shapes) and the drift engine (which reads them) share one definition of the
 * snapshot format; `scripts/probe/shape.mts` re-exports it.
 */

export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

export interface Shape {
  /** Sorted union of JSON types observed at this position. */
  types: JsonType[];
  /** Merged, alphabetically sorted key map — present when `object` was observed. */
  keys?: Record<string, Shape>;
  /**
   * Merged element shape — present when a non-empty `array` was observed, or
   * carried over from the previous baseline (then `itemsFromBaseline` is set).
   */
  items?: Shape;
  /**
   * Set on an array position whose `items` were not observed in this run (every
   * array there was empty) but kept from the previous committed baseline.
   * Consumers treat `items` as a normal element shape.
   */
  itemsFromBaseline?: true;
  /** Number of keys dropped by the key cap at this level, when any. */
  droppedKeys?: number;
  /** Set when recursion stopped at the depth cap (children are not described). */
  depthCapped?: true;
}

export interface SummarizeOptions {
  /** Maximum nesting depth described. Deeper levels are marked `depthCapped`. */
  maxDepth: number;
  /** Maximum keys described per object level (alphabetical, first N kept). */
  maxKeys: number;
}

export const DEFAULT_SUMMARIZE_OPTIONS: SummarizeOptions = { maxDepth: 6, maxKeys: 80 };

/** Reduce an arbitrary decoded JSON value to its structural shape. */
export function summarize(
  value: unknown,
  options: SummarizeOptions = DEFAULT_SUMMARIZE_OPTIONS,
): Shape {
  return walk(value, 0, options);
}

function walk(value: unknown, depth: number, o: SummarizeOptions): Shape {
  const type = jsonType(value);
  if (type === 'object') {
    if (depth >= o.maxDepth) return { types: ['object'], depthCapped: true };
    const record = value as Record<string, unknown>;
    // Mirror JSON.stringify: keys whose value is `undefined` (or a function)
    // do not exist on the wire, so they do not exist in the shape either.
    const names = Object.keys(record)
      .filter((k) => record[k] !== undefined && typeof record[k] !== 'function')
      .sort();
    const kept = names.slice(0, o.maxKeys);
    const keys: Record<string, Shape> = {};
    for (const k of kept) keys[k] = walk(record[k], depth + 1, o);
    const shape: Shape = { types: ['object'], keys };
    if (names.length > kept.length) shape.droppedKeys = names.length - kept.length;
    return shape;
  }
  if (type === 'array') {
    if (depth >= o.maxDepth) return { types: ['array'], depthCapped: true };
    let items: Shape | undefined;
    for (const element of value as unknown[]) {
      const s = walk(element, depth + 1, o);
      items = items ? mergeShapes(items, s) : s;
    }
    return items ? { types: ['array'], items } : { types: ['array'] };
  }
  return { types: [type] };
}

function jsonType(value: unknown): JsonType {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
    case 'bigint':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      // SDK normalisers may turn ISO strings into Date instances; on the wire
      // (and after JSON.stringify) they are strings.
      return value instanceof Date ? 'string' : 'object';
    default:
      return 'null';
  }
}

/** Union two shapes: types, keys and element shapes are merged recursively. */
export function mergeShapes(a: Shape, b: Shape): Shape {
  const out: Shape = { types: sortUnique([...a.types, ...b.types]) };
  if (a.keys || b.keys) {
    const keys: Record<string, Shape> = {};
    for (const k of sortUnique([...Object.keys(a.keys ?? {}), ...Object.keys(b.keys ?? {})])) {
      const x = a.keys?.[k];
      const y = b.keys?.[k];
      keys[k] = x && y ? mergeShapes(x, y) : (x ?? y)!;
    }
    out.keys = keys;
  }
  if (a.items && b.items) {
    out.items = mergeShapes(a.items, b.items);
    // Still "from the baseline" only if no side actually observed elements.
    if (a.itemsFromBaseline && b.itemsFromBaseline) out.itemsFromBaseline = true;
  } else if (a.items || b.items) {
    const side = a.items ? a : b;
    out.items = side.items;
    if (side.itemsFromBaseline) out.itemsFromBaseline = true;
  }
  const dropped = Math.max(a.droppedKeys ?? 0, b.droppedKeys ?? 0);
  if (dropped > 0) out.droppedKeys = dropped;
  if (a.depthCapped || b.depthCapped) out.depthCapped = true;
  return out;
}

/**
 * Keep known element shapes when a fresh sample only had empty arrays.
 *
 * Wherever `fresh` has an array position without `items` (every array there
 * was empty — not a depth cap) and `baseline` has `items` at the same
 * position, the baseline's `items` are kept and the position is marked
 * `itemsFromBaseline: true`. Nothing else is carried over: keys, types and
 * caps come from `fresh` alone, so removals stay detectable. Neither input is
 * modified.
 */
export function carryEmptyArrayItems(fresh: Shape, baseline: Shape | undefined): Shape {
  if (!baseline) return fresh;
  let out = fresh;
  if (fresh.keys && baseline.keys) {
    const keys: Record<string, Shape> = {};
    let changed = false;
    for (const [k, child] of Object.entries(fresh.keys)) {
      keys[k] = carryEmptyArrayItems(child, baseline.keys[k]);
      changed ||= keys[k] !== child;
    }
    if (changed) out = { ...out, keys };
  }
  if (fresh.items) {
    const items = carryEmptyArrayItems(fresh.items, baseline.items);
    if (items !== fresh.items) out = { ...out, items };
  } else if (isEmptyArraySample(fresh) && baseline.items) {
    out = { ...out, items: baseline.items, itemsFromBaseline: true };
  }
  return out;
}

/** An array position with no element shape because every sampled array was empty. */
function isEmptyArraySample(shape: Shape): boolean {
  return shape.types.includes('array') && !shape.items && !shape.depthCapped;
}

export type ShapeDiffKind = 'added' | 'removed' | 'type-changed' | 'nullability' | 'uncomparable';

export interface ShapeDiff {
  /** JSONPath-ish location, e.g. `$.items[].lineItems[].sku`. */
  path: string;
  kind: ShapeDiffKind;
  from?: string;
  to?: string;
}

/**
 * Structural diff between a committed shape and a fresh one.
 *
 * - `added` / `removed`: a key exists on one side only.
 * - `type-changed`: the non-null type set differs (`string` → `number`, …).
 * - `nullability`: only the presence of `null` differs. Reported for
 *   information but *not* treated as drift — with small sample pages a
 *   nullable field is frequently null in one run and populated in the next.
 * - `uncomparable`: the baseline knows an element shape but every array at
 *   that position was empty in the fresh sample. Informational, not drift.
 *
 * Array element shapes are only compared when both sides observed at least
 * one element; an empty page on either side is data churn, not drift.
 */
export function diffShapes(
  before: Shape | undefined,
  after: Shape | undefined,
  path = '$',
): ShapeDiff[] {
  const out: ShapeDiff[] = [];
  if (!before && !after) return out;
  if (!before) return [{ path, kind: 'added', to: describe(after!) }];
  if (!after) return [{ path, kind: 'removed', from: describe(before) }];

  const beforeTypes = before.types.join('|');
  const afterTypes = after.types.join('|');
  if (beforeTypes !== afterTypes) {
    const nonNull = (t: JsonType[]) => t.filter((x) => x !== 'null').join('|');
    const kind: ShapeDiffKind =
      nonNull(before.types) === nonNull(after.types) ? 'nullability' : 'type-changed';
    out.push({ path, kind, from: beforeTypes, to: afterTypes });
  }

  if (before.keys && after.keys) {
    for (const k of sortUnique([...Object.keys(before.keys), ...Object.keys(after.keys)])) {
      out.push(...diffShapes(before.keys[k], after.keys[k], `${path}.${k}`));
    }
  }
  if (before.items && after.items) {
    out.push(...diffShapes(before.items, after.items, `${path}[]`));
  } else if (before.items && isEmptyArraySample(after)) {
    out.push({
      path: `${path}[]`,
      kind: 'uncomparable',
      from: describe(before.items),
      to: 'no elements in this sample',
    });
  }
  return out;
}

/** Diff kinds that are reported for information only and never count as drift. */
export function isInformationalDiff(diff: ShapeDiff): boolean {
  return diff.kind === 'nullability' || diff.kind === 'uncomparable';
}

/** One-line human summary of a shape, e.g. `array<object{12}>` or `string|null`. */
export function describe(shape: Shape): string {
  const parts = shape.types.map((t) => {
    if (t === 'object') return `object{${shape.keys ? Object.keys(shape.keys).length : '?'}}`;
    if (t === 'array') return shape.items ? `array<${describe(shape.items)}>` : 'array<empty>';
    return t;
  });
  return parts.join('|');
}

function sortUnique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}
