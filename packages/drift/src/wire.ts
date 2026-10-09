/**
 * Wire capture for contract probes.
 *
 * {@link createWireRecorder} wraps a `fetch` so that every request an SDK
 * makes is recorded as `{ operation, status, contentType, body, shape }`:
 * the documented operation it hit (or a redacted path when no spec describes
 * it) and the structural {@link Shape} of the parsed JSON body. The body is
 * read from `response.clone()`, so the SDK consumes the original response
 * exactly as it would without the recorder.
 *
 * Only 2xx bodies are summarised. Error bodies are not read at all — the
 * marketplaces echo request data (and sometimes PII) into them, and the probe
 * already records the SDK's error code. Query strings are never recorded.
 */
import { isUnmatched, type OperationIndex, type WireOperation } from './operations.js';
import {
  DEFAULT_SUMMARIZE_OPTIONS,
  describe,
  diffShapes,
  mergeShapes,
  summarize,
  type Shape,
  type ShapeDiff,
  type SummarizeOptions,
} from './shape.js';

/**
 * How the response body was handled:
 * - `json` — parsed and summarised into `shape`;
 * - `non-json` — a 2xx body that is not JSON (HTML error page, plain text, …);
 * - `empty` — no body (`204`, or a zero-length 2xx);
 * - `not-recorded` — a non-2xx response (body deliberately not read) or a body that could not be read.
 */
export type WireBody = 'json' | 'non-json' | 'empty' | 'not-recorded';

/** One wire exchange as stored in a probe snapshot (`probes[name].wire[]`). */
export interface WireExchange {
  operation: WireOperation;
  status: number;
  /** Media type of the response, without parameters (`application/json`). */
  contentType?: string;
  body: WireBody;
  shape?: Shape;
}

export interface WireRecorderOptions {
  index: OperationIndex;
  /** The `fetch` to delegate to. Default: `globalThis.fetch` at the time the recorder is created. */
  fetch?: typeof fetch;
  summarizeOptions?: SummarizeOptions;
}

export interface WireRecorder {
  /** Drop-in `fetch` that records every exchange. */
  fetch: typeof fetch;
  /**
   * Wait for pending body reads, then return the exchanges recorded since the
   * previous `take()` — collapsed per operation (see {@link collapseExchanges}) —
   * and start a fresh batch.
   */
  take(): Promise<WireExchange[]>;
}

export function createWireRecorder(options: WireRecorderOptions): WireRecorder {
  const inner = options.fetch ?? globalThis.fetch;
  const summarizeOptions = options.summarizeOptions ?? DEFAULT_SUMMARIZE_OPTIONS;
  let pending: Promise<WireExchange | undefined>[] = [];

  const recorded: typeof fetch = async (input, init) => {
    const response = await inner(input, init);
    // Clone synchronously, before the SDK can start consuming the original body.
    let copy: Response | undefined;
    try {
      copy = response.ok ? response.clone() : undefined;
    } catch {
      copy = undefined;
    }
    pending.push(
      record(
        requestMethod(input, init),
        requestUrl(input),
        response,
        copy,
        options.index,
        summarizeOptions,
      ),
    );
    return response;
  };

  return {
    fetch: recorded,
    async take() {
      const batch = pending;
      pending = [];
      const settled = await Promise.all(batch);
      return collapseExchanges(settled.filter((x): x is WireExchange => x !== undefined));
    },
  };
}

/**
 * Run `build` with `globalThis.fetch` temporarily replaced by `fetchImpl`.
 *
 * The SDK factories (`createTrendyolClient`, `createHepsiburadaClient`) do not
 * expose the transport's `fetch` option, but both transports capture
 * `config.fetch ?? fetch` when they are constructed. Constructing the client
 * inside this window therefore binds it to `fetchImpl` for its whole lifetime,
 * without changing SDK code and without leaving the global patched.
 */
export function withGlobalFetch<T>(fetchImpl: typeof fetch, build: () => T): T {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return build();
  } finally {
    globalThis.fetch = original;
  }
}

async function record(
  method: string,
  url: string,
  response: Response,
  copy: Response | undefined,
  index: OperationIndex,
  summarizeOptions: SummarizeOptions,
): Promise<WireExchange | undefined> {
  let operation: WireOperation;
  try {
    operation = index.match(method, url);
  } catch {
    return undefined; // not an absolute URL — nothing meaningful to record
  }
  const contentType = mediaType(response.headers.get('content-type'));
  const base = { operation, status: response.status, ...(contentType ? { contentType } : {}) };
  if (!response.ok || !copy) return { ...base, body: 'not-recorded' };
  let text: string;
  try {
    text = await copy.text();
  } catch {
    return { ...base, body: 'not-recorded' };
  }
  if (text.trim() === '') return { ...base, body: 'empty' };
  try {
    return { ...base, body: 'json', shape: summarize(JSON.parse(text), summarizeOptions) };
  } catch {
    return { ...base, body: 'non-json' };
  }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: string | URL | Request, init: RequestInit | undefined): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && 'method' in input) return input.method.toUpperCase();
  return 'GET';
}

function mediaType(header: string | null): string | undefined {
  const value = header?.split(';')[0]?.trim().toLowerCase();
  return value || undefined;
}

const BODY_RANK: Record<WireBody, number> = { json: 0, 'non-json': 1, empty: 2, 'not-recorded': 3 };

/**
 * Make a probe's exchange list deterministic:
 *
 * - exchanges are grouped by operation key; 2xx exchanges with the same status
 *   are merged (shapes unioned with {@link mergeShapes});
 * - non-2xx exchanges are kept only when the operation never succeeded in
 *   this batch — a retried `503` followed by a `200` is transport noise, not
 *   contract;
 * - output is sorted by operation key, then status.
 */
export function collapseExchanges(exchanges: readonly WireExchange[]): WireExchange[] {
  const groups = new Map<string, WireExchange[]>();
  for (const ex of exchanges) {
    const list = groups.get(ex.operation.key) ?? [];
    list.push(ex);
    groups.set(ex.operation.key, list);
  }
  const out: WireExchange[] = [];
  for (const key of [...groups.keys()].sort()) {
    const list = groups.get(key)!;
    const succeeded = list.some((x) => isSuccess(x.status));
    const byStatus = new Map<number, WireExchange>();
    for (const ex of list) {
      if (succeeded && !isSuccess(ex.status)) continue;
      const prev = byStatus.get(ex.status);
      byStatus.set(ex.status, prev ? mergeExchange(prev, ex) : ex);
    }
    for (const status of [...byStatus.keys()].sort((a, b) => a - b))
      out.push(byStatus.get(status)!);
  }
  return out;
}

function mergeExchange(a: WireExchange, b: WireExchange): WireExchange {
  const contentTypes = [
    ...new Set([a.contentType, b.contentType].filter((x) => x !== undefined)),
  ].sort();
  const shape = a.shape && b.shape ? mergeShapes(a.shape, b.shape) : (a.shape ?? b.shape);
  const body = BODY_RANK[a.body] <= BODY_RANK[b.body] ? a.body : b.body;
  return {
    operation: a.operation,
    status: a.status,
    ...(contentTypes.length ? { contentType: contentTypes.join(', ') } : {}),
    body: shape ? 'json' : body,
    ...(shape ? { shape } : {}),
  };
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/** Comparison of a committed wire list with a fresh one. */
export type WireDiff =
  | { baseline: 'missing' }
  | {
      baseline: 'present';
      /** Operation-level changes (operation added / removed, status, content type, body kind). Always drift. */
      changes: string[];
      /** Structural changes per operation; paths are prefixed with the operation key. */
      shapeDiffs: ShapeDiff[];
    };

/**
 * Compare a probe's committed `wire` list with a fresh one. An old snapshot
 * without a `wire` field yields `{ baseline: 'missing' }` — "no baseline yet",
 * not drift.
 */
export function diffWire(
  before: readonly WireExchange[] | undefined,
  after: readonly WireExchange[] | undefined,
): WireDiff {
  if (!before) return { baseline: 'missing' };
  const b = byOperation(before);
  const a = byOperation(after ?? []);
  const changes: string[] = [];
  const shapeDiffs: ShapeDiff[] = [];
  for (const key of [...new Set([...b.keys(), ...a.keys()])].sort()) {
    const x = b.get(key);
    const y = a.get(key);
    if (!x) {
      changes.push(`${label(y![0]!)}: new wire call (${summary(y!)})`);
      continue;
    }
    if (!y) {
      changes.push(`${label(x[0]!)}: no longer called (was ${summary(x)})`);
      continue;
    }
    const fields: [string, (e: WireExchange) => string][] = [
      ['status', (e) => String(e.status)],
      ['content type', (e) => e.contentType ?? '-'],
      ['body', (e) => e.body],
    ];
    for (const [name, pick] of fields) {
      const from = x.map(pick).join(', ');
      const to = y.map(pick).join(', ');
      if (from !== to) changes.push(`${key}: ${name} ${from} → ${to}`);
    }
    shapeDiffs.push(...diffShapes(mergedShape(x), mergedShape(y), `${key} $`));
  }
  return { baseline: 'present', changes, shapeDiffs };
}

function byOperation(list: readonly WireExchange[]): Map<string, WireExchange[]> {
  const map = new Map<string, WireExchange[]>();
  for (const ex of list) {
    const entries = map.get(ex.operation.key) ?? [];
    entries.push(ex);
    map.set(ex.operation.key, entries);
  }
  return map;
}

function mergedShape(list: WireExchange[]): Shape | undefined {
  return list.reduce<Shape | undefined>(
    (acc, ex) => (ex.shape ? (acc ? mergeShapes(acc, ex.shape) : ex.shape) : acc),
    undefined,
  );
}

function label(ex: WireExchange): string {
  return isUnmatched(ex.operation) ? `${ex.operation.key} (no spec)` : ex.operation.key;
}

function summary(list: WireExchange[]): string {
  return list
    .map((e) => `HTTP ${e.status}${e.shape ? ` ${describe(e.shape)}` : ` ${e.body}`}`)
    .join(', ');
}
