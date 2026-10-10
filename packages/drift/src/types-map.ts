/**
 * The SDK type map (`packages/drift/sdk-type-map.json`): which SDK interface
 * mirrors which documented response object. Hand-maintained and validated on
 * load — only types that genuinely mirror a wire object belong here
 * (normalised, renamed or flattened public types do not; see the README).
 */
import { existsSync, readFileSync } from 'node:fs';

/** Default map file, relative to the repo root. */
export const SDK_TYPE_MAP_FILE = 'packages/drift/sdk-type-map.json';

export interface SdkTypeMapEntry {
  /** Marketplace id (`trendyol`, `hepsiburada`). */
  marketplace: string;
  /** Interface or type alias name in `source` (may be declared inside a function). */
  sdkType: string;
  /** Source file declaring `sdkType`, relative to the repo root. */
  source: string;
  /** Spec document id, `<marketplace>/<file>.json`. */
  spec: string;
  /** Operation key as the drift reports print it: `<METHOD> <server base path + path template>`. */
  operation: string;
  /** Where in the response body the type sits: `(root)`, `content[]`, `data.items[]`, `[]`. */
  pointer: string;
  /**
   * SDK property paths (relative to `sdkType`, e.g. `raw`, `lines[].raw`) that
   * are not wire fields at all — escape hatches, values the normaliser builds.
   * Neither compared nor reported.
   */
  ignore?: string[];
  /**
   * SDK property paths the normaliser deliberately converts (`String(id)`,
   * ms-epoch → ISO string): presence is still checked, the JSON type is not.
   */
  coerced?: string[];
  /** Why the type is mapped this way — shown in the report. */
  note?: string;
}

/** Raised for an unreadable or invalid map; `message` lists every problem. */
export class SdkTypeMapError extends Error {
  override name = 'SdkTypeMapError';
}

const REQUIRED = ['marketplace', 'sdkType', 'source', 'spec', 'operation', 'pointer'] as const;
const OPTIONAL = ['ignore', 'coerced', 'note'] as const;
const OPERATION = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** `name`, `name[]`, `name[][]`; the first segment may be `[]` alone (root array). */
const SEGMENT = /^([^.[\]\s]+)?((?:\[\])*)$/;

/** Split a pointer / relative path into `{ name, arrays }` steps; `undefined` when malformed. */
export function parsePath(path: string): { name?: string; arrays: number }[] | undefined {
  if (path === '(root)') return [];
  const steps: { name?: string; arrays: number }[] = [];
  const segments = path.split('.');
  for (const [i, segment] of segments.entries()) {
    const m = SEGMENT.exec(segment);
    const arrays = m ? m[2]!.length / 2 : 0;
    if (!m || (!m[1] && (i > 0 || arrays === 0))) return undefined;
    steps.push({ ...(m[1] ? { name: m[1] } : {}), arrays });
  }
  return steps;
}

/** Validate a parsed map document and return its entries; every problem is thrown as one {@link SdkTypeMapError}. */
export function parseSdkTypeMap(value: unknown, source: string): SdkTypeMapEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new SdkTypeMapError(`${source}: expected an object with an "entries" array`);
  }
  const problems: string[] = [];
  for (const key of Object.keys(value)) {
    if (key !== '$comment' && key !== 'entries') problems.push(`unknown top-level key "${key}"`);
  }
  const entries: SdkTypeMapEntry[] = [];
  const seen = new Map<string, number>();
  value.entries.forEach((raw: unknown, i: number) => {
    const at = `entries[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${at}: expected an object`);
      return;
    }
    const before = problems.length;
    for (const key of Object.keys(raw)) {
      if (![...REQUIRED, ...OPTIONAL].includes(key as never))
        problems.push(`${at}: unknown key "${key}"`);
    }
    for (const key of REQUIRED) {
      if (typeof raw[key] !== 'string' || raw[key].trim() === '')
        problems.push(`${at}.${key}: required, must be a non-empty string`);
    }
    if (problems.length > before) return;
    const e = raw as unknown as SdkTypeMapEntry;
    if (!IDENTIFIER.test(e.sdkType))
      problems.push(`${at}.sdkType: "${e.sdkType}" is not an identifier`);
    if (!/\.tsx?$/.test(e.source) || e.source.startsWith('/') || e.source.split('/').includes('..'))
      problems.push(`${at}.source: "${e.source}" must be a relative .ts path inside the repo`);
    if (!e.spec.startsWith(`${e.marketplace}/`) || !e.spec.endsWith('.json'))
      problems.push(`${at}.spec: "${e.spec}" must be "${e.marketplace}/<file>.json"`);
    if (!OPERATION.test(e.operation))
      problems.push(`${at}.operation: "${e.operation}" must look like "GET /path/{param}"`);
    if (!parsePath(e.pointer))
      problems.push(
        `${at}.pointer: "${e.pointer}" is not "(root)" or a path like "content[].lines[]"`,
      );
    for (const key of ['ignore', 'coerced'] as const) {
      const list = raw[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || !list.length) {
        problems.push(`${at}.${key}: must be a non-empty array of property paths`);
        continue;
      }
      list.forEach((p: unknown, j: number) => {
        if (typeof p !== 'string' || p === '(root)' || !parsePath(p))
          problems.push(`${at}.${key}[${j}]: not a property path like "raw" or "lines[].raw"`);
      });
      if (new Set(list).size !== list.length) problems.push(`${at}.${key}: duplicate paths`);
    }
    if (raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.trim() === ''))
      problems.push(`${at}.note: must be a non-empty string`);
    if (problems.length > before) return;
    const id = [e.marketplace, e.sdkType, e.source, e.operation, e.pointer].join('\u0000');
    const first = seen.get(id);
    if (first !== undefined) {
      problems.push(`${at}: duplicate of entries[${first}] (same type, operation and pointer)`);
      return;
    }
    seen.set(id, i);
    entries.push({
      marketplace: e.marketplace,
      sdkType: e.sdkType,
      source: e.source,
      spec: e.spec,
      operation: e.operation,
      pointer: e.pointer,
      ...(e.ignore ? { ignore: [...e.ignore] } : {}),
      ...(e.coerced ? { coerced: [...e.coerced] } : {}),
      ...(e.note ? { note: e.note } : {}),
    });
  });
  if (problems.length) {
    throw new SdkTypeMapError(
      [`${source}: invalid SDK type map`, ...problems.map((p) => `  - ${p}`)].join('\n'),
    );
  }
  return entries;
}

/** Read and validate the map file. */
export function loadSdkTypeMap(file: string): SdkTypeMapEntry[] {
  if (!existsSync(file)) throw new SdkTypeMapError(`${file}: file not found`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SdkTypeMapError(`${file}: not valid JSON (${(err as Error).message})`);
  }
  return parseSdkTypeMap(parsed, file);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
