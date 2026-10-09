/**
 * URL → spec operation matching.
 *
 * Every operation of every loaded spec is indexed under each of its servers:
 * `servers[].url` (host + base path) joined with the path template, with
 * `{param}` segments acting as wildcards. A request URL is matched by method,
 * host and path; the query string is ignored. Literal segments compare
 * case-insensitively: `@lonca/hepsiburada` calls `/orders/merchantId/…`
 * where the portal documents `/orders/merchantid/…`, and the endpoint
 * answers either way — that is not the contract drift this looks for.
 *
 * What gets recorded for a match is the *template*, never the concrete path,
 * so ids that live in path segments (seller ids, merchant UUIDs, package ids)
 * never reach a snapshot. URLs no spec describes are recorded through
 * {@link redactPath}, which replaces every segment that could carry a value.
 */
import { HTTP_METHODS, type SpecFile } from './openapi.js';

/** A request matched to a documented operation. */
export interface MatchedOperation {
  /** `"<METHOD> <full path template>"`, e.g. `GET /integration/order/sellers/{sellerId}/orders`. */
  key: string;
  /** Spec file id, e.g. `trendyol/marketplace.json`. */
  spec: string;
  operationId?: string;
  method: string;
  /** Full path template: the server base path joined with `specPath`. */
  path: string;
  /** The key of the operation under `paths` in the spec document. */
  specPath: string;
  /** The `servers[].url` entry the request matched. */
  server: string;
}

/** A request no spec operation describes. The path is redacted (`{}` per value-like segment). */
export interface UnmatchedOperation {
  /** `"<METHOD> <host><redacted path>"`. */
  key: string;
  unmatched: true;
  method: string;
  host: string;
  path: string;
}

export type WireOperation = MatchedOperation | UnmatchedOperation;

export function isUnmatched(op: WireOperation): op is UnmatchedOperation {
  return (op as UnmatchedOperation).unmatched === true;
}

interface IndexedOperation {
  op: Omit<MatchedOperation, 'server'>;
  server: string;
  hosts: string[];
  segments: TemplateSegment[];
  /** Specificity: 10 000 per literal segment + literal characters inside templated segments. */
  literals: number;
}

export interface OperationIndex {
  /** Number of (operation × server) entries indexed. */
  size: number;
  /** Match a request; unmatched requests get a redacted path. */
  match(method: string, url: string | URL): WireOperation;
}

export interface OperationIndexOptions {
  /**
   * Extra hostnames a spec server host also answers on. Defaults to
   * {@link defaultHostVariants}.
   */
  hostVariants?: (host: string) => string[];
}

/**
 * Hepsiburada's portal documents only the SIT hosts (`<service>-sit.hepsiburada.com`,
 * `mpop-sit.hepsiburada.com`). The production host of each service is the same
 * name without `-sit` — that is how `@lonca/hepsiburada`'s transport builds its
 * `prod` base URLs, verified against production in #139. Trendyol publishes
 * both its production and stage servers, so it needs no variant.
 */
export function defaultHostVariants(host: string): string[] {
  const m = /^([^.]+)-sit(\.hepsiburada\.com)$/i.exec(host);
  return m ? [`${m[1]}${m[2]}`] : [];
}

/** Build a matcher over every operation × server of the given specs. */
export function buildOperationIndex(
  specs: readonly SpecFile[],
  options: OperationIndexOptions = {},
): OperationIndex {
  const variants = options.hostVariants ?? defaultHostVariants;
  const entries: IndexedOperation[] = [];
  for (const spec of specs) {
    const servers = spec.document.servers?.length ? spec.document.servers : [{ url: '' }];
    for (const [specPath, item] of Object.entries(spec.document.paths ?? {})) {
      for (const method of HTTP_METHODS) {
        const op = item[method] as { operationId?: string } | undefined;
        if (!op || typeof op !== 'object') continue;
        for (const server of servers) {
          const { host, basePath } = parseServer(server.url);
          const path = joinPath(basePath, specPath);
          const segments = splitPath(path).map(templateSegment);
          const upper = method.toUpperCase();
          entries.push({
            op: {
              key: `${upper} ${path}`,
              spec: spec.id,
              ...(op.operationId ? { operationId: op.operationId } : {}),
              method: upper,
              path,
              specPath,
            },
            server: server.url,
            hosts: host ? [host, ...variants(host)].map((h) => h.toLowerCase()) : [],
            segments,
            literals: segments.reduce(
              (score, s) =>
                score + (typeof s === 'string' ? 10_000 : s.reduce((n, p) => n + p.length, 0)),
              0,
            ),
          });
        }
      }
    }
  }

  return {
    size: entries.length,
    match(method, rawUrl) {
      const url = typeof rawUrl === 'string' ? new URL(rawUrl) : rawUrl;
      const upper = method.toUpperCase();
      const host = url.host.toLowerCase();
      const parts = splitPath(url.pathname).map(safeDecode);
      let best: IndexedOperation | undefined;
      for (const e of entries) {
        if (e.op.method !== upper) continue;
        // A server without a host (relative `servers[].url`) matches any host.
        if (e.hosts.length && !e.hosts.includes(host)) continue;
        if (!segmentsMatch(e.segments, parts)) continue;
        // Most literal segments wins (`/claims/create` beats `/claims/{id}`),
        // then most literal characters inside templated segments (`v{a}.{b}`
        // beats `{a}{b}`); ties go to the first entry, which is stable.
        if (!best || e.literals > best.literals) best = e;
      }
      if (best) return { ...best.op, server: best.server };
      const path = redactPath(url.pathname);
      return { key: `${upper} ${host}${path}`, unmatched: true, method: upper, host, path };
    },
  };
}

/**
 * Segments kept verbatim in an unmatched path: lower-camel / kebab / snake
 * words with at most a two-digit suffix (`api`, `v1`, `merchantid`,
 * `shipment-packages`, `oauth2`). Anything else — numbers, UUIDs, hashes,
 * barcodes, upper-case codes, percent-encoded or very long segments — is
 * replaced with `{}`. Erring towards redaction is deliberate.
 */
const SAFE_SEGMENT = /^[a-z][a-zA-Z]*(?:[-_][a-zA-Z]+)*\d{0,2}$/;

/** Replace every segment of `pathname` that could carry a value with `{}`. */
export function redactPath(pathname: string): string {
  const segments = splitPath(pathname).map((s) =>
    s.length <= 40 && SAFE_SEGMENT.test(s) ? s : '{}',
  );
  return `/${segments.join('/')}`;
}

function parseServer(serverUrl: string): { host: string; basePath: string } {
  try {
    const u = new URL(serverUrl);
    return { host: u.host, basePath: u.pathname };
  } catch {
    // Relative server URL (`/integration`) — base path only.
    return { host: '', basePath: serverUrl };
  }
}

function joinPath(basePath: string, specPath: string): string {
  return `/${[...splitPath(basePath), ...splitPath(specPath)].join('/')}`;
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * A template segment is either a literal (lower-cased) or, when it contains
 * `{param}` placeholders, the literal pieces around them (`{name}.json` →
 * `['', '.json']`). Matching is a linear glob walk rather than a generated
 * regular expression, so a hostile URL cannot trigger polynomial backtracking.
 */
type TemplateSegment = string | string[];

function templateSegment(segment: string): TemplateSegment {
  const pieces: string[] = [];
  let literal = '';
  let i = 0;
  while (i < segment.length) {
    const close = segment[i] === '{' ? segment.indexOf('}', i) : -1;
    if (close === -1) {
      literal += segment[i];
      i += 1;
      continue;
    }
    pieces.push(literal.toLowerCase());
    literal = '';
    i = close + 1;
  }
  pieces.push(literal.toLowerCase());
  return pieces.length === 1 ? pieces[0]! : pieces;
}

/** Each placeholder matches one or more characters; leftmost matching of the inner pieces is exact for this glob form. */
function globMatch(pieces: string[], value: string): boolean {
  const v = value.toLowerCase();
  const first = pieces[0]!;
  const last = pieces[pieces.length - 1]!;
  if (!v.startsWith(first)) return false;
  let pos = first.length;
  for (let k = 1; k < pieces.length - 1; k++) {
    const idx = v.indexOf(pieces[k]!, pos + 1);
    if (idx === -1) return false;
    pos = idx + pieces[k]!.length;
  }
  return v.length - last.length >= pos + 1 && v.endsWith(last);
}

function segmentsMatch(template: TemplateSegment[], parts: string[]): boolean {
  if (template.length !== parts.length) return false;
  return template.every((t, i) =>
    typeof t === 'string' ? t === parts[i]!.toLowerCase() : globMatch(t, parts[i]!),
  );
}
