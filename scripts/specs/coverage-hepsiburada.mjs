#!/usr/bin/env node
/**
 * Cross-checks `specs/hepsiburada/*.json` against the `@lonca/hepsiburada` SDK.
 *
 * Usage:
 *   node scripts/specs/coverage-hepsiburada.mjs [--specs specs/hepsiburada]
 *        [--resources sdks/hepsiburada/src/resources] [--json]
 *
 * Prints (as Markdown, or JSON with `--json`):
 *   1. resource -> spec file -> implemented / total operations
 *   2. spec operations the SDK does not implement
 *   3. SDK operations that have no spec (services not published on the portal)
 *
 * The SDK side is derived from the resource sources by scanning `path:` template
 * literals and the `method:` that precedes them (plus the known helpers whose
 * method is fixed). Paths are compared case-insensitively with every path
 * parameter and template expression collapsed to `{}`; the spec path is prefixed
 * with the base path of its `servers[0].url` (e.g. `/product`, `/ticket-api`).
 *
 * Plain Node >= 18, no dependencies.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

function parseArgs(argv) {
  const args = {
    specs: 'specs/hepsiburada',
    resources: 'sdks/hepsiburada/src/resources',
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--specs') args.specs = argv[++i];
    else if (a === '--resources') args.resources = argv[++i];
    else if (a === '--json') args.json = true;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

/** `/orders/merchantId/${this.merchantSegment()}/x/{id}` -> `/orders/merchantid/{}/x/{}` */
function normalize(path) {
  return path
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/+$/, '')
    .toLowerCase();
}

// Helpers in the SDK whose HTTP method is fixed but not written next to the path.
const HELPER_METHODS = [
  [/\b(getOrdersPage|getPackagesArray|getPackagesPage|pollUpload)\(/, 'GET'],
  [/\bsubmitUpload\(/, 'POST'],
];

/** Extract `{ method, path, service, line }` entries from one resource source. */
function scanResource(file) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const basePath = src.match(/const BASE_PATH = '([^']+)'/)?.[1] ?? '';
  const services = [...src.matchAll(/const SERVICE\w* = '([^']+)'/g)].map((m) => m[1]);
  const service = [...new Set(services)].join('+');
  const ops = [];

  const isComment = (l) => /^\s*(\*|\/\/|\/\*)/.test(l);

  lines.forEach((line, idx) => {
    if (isComment(line)) return;
    let literal;
    // `return this.getOrdersPage(`/orders/...`, params)` — helper with the path inline.
    const inlineHelper = line.match(/\b\w+\((?:`(\/[^`]*)`|'(\/[^']*)')/);
    // `path: `/orders/...`` or `path: BASE_PATH`
    const prop = line.match(/path:\s*(?:`([^`]*)`|'([^']*)'|(BASE_PATH))/);
    // helper call argument written on its own line: `'/listings/merchantid/${id}/x',`
    const arg = line.match(/^\s*(?:`(\/[^`]*)`|'(\/[^']*)')\s*,?\s*$/);
    if (inlineHelper) literal = inlineHelper[1] ?? inlineHelper[2];
    else if (prop) literal = prop[3] ? '${BASE_PATH}' : (prop[1] ?? prop[2]);
    else if (arg) literal = arg[1] ?? arg[2];
    else return;

    const path = literal.replace('${BASE_PATH}', basePath);
    if (!path.startsWith('/')) return;

    // Find the method: explicit `method:` within the preceding 8 lines, else a helper.
    let method;
    for (let back = 0; back <= 8 && idx - back >= 0; back++) {
      const l = lines[idx - back];
      const mm = l.match(/method:\s*'([A-Z]+)'/);
      if (mm) {
        method = mm[1];
        break;
      }
      for (const [re, verb] of HELPER_METHODS) if (re.test(l)) method = verb;
      if (method) break;
    }
    if (!method) return;

    // `${action}` in orders.ts expands to the three package status transitions.
    const variants = path.includes('${action}')
      ? ['intransit', 'deliver', 'undeliver'].map((a) => path.replace('${action}', a))
      : [path];
    for (const p of variants)
      ops.push({ method, path: p, key: `${method} ${normalize(p)}`, line: idx + 1 });
  });

  // De-duplicate (helpers are reached from several public methods).
  const seen = new Map();
  for (const op of ops) if (!seen.has(op.key)) seen.set(op.key, op);
  return { resource: basename(file, '.ts'), service, basePath, ops: [...seen.values()] };
}

function loadSpecs(dir) {
  const specs = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const serverUrl = doc.servers?.[0]?.url ?? '';
    const prefix = serverUrl ? new URL(serverUrl).pathname.replace(/\/$/, '') : '';
    const ops = [];
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        ops.push({
          method: method.toUpperCase(),
          path,
          key: `${method.toUpperCase()} ${normalize(prefix + path)}`,
          // Fallback key without the server base path: catches SDK calls that target the
          // same route on a different host/prefix than the portal publishes.
          bareKey: `${method.toUpperCase()} ${normalize(path)}`,
          summary: op.summary ?? '',
          operationId: op.operationId,
        });
      }
    }
    specs.push({ file: f, host: serverUrl ? new URL(serverUrl).host : '', prefix, ops });
  }
  return specs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const resourcesDir = resolve(args.resources);
  const resources = readdirSync(resourcesDir)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => scanResource(join(resourcesDir, f)));
  const specs = loadSpecs(resolve(args.specs));

  const specIndex = new Map(); // key -> { file, op }
  const bareIndex = new Map(); // bareKey -> { file, op }
  for (const s of specs)
    for (const op of s.ops) {
      specIndex.set(op.key, { file: s.file, op });
      if (!bareIndex.has(op.bareKey)) bareIndex.set(op.bareKey, { file: s.file, op });
    }

  const implemented = new Set();
  const rows = [];
  for (const r of resources) {
    const byFile = new Map();
    const unmatched = [];
    let prefixMismatch = 0;
    for (const op of r.ops) {
      let hit = specIndex.get(op.key);
      if (!hit && bareIndex.has(op.key)) {
        hit = bareIndex.get(op.key);
        prefixMismatch++;
      }
      if (hit) {
        implemented.add(hit.op.key);
        byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
      } else unmatched.push(op);
    }
    rows.push({
      resource: r.resource,
      service: r.service,
      sdkOps: r.ops.length,
      byFile,
      unmatched,
      prefixMismatch,
    });
  }

  const missing = [];
  for (const s of specs)
    for (const op of s.ops) if (!implemented.has(op.key)) missing.push({ file: s.file, ...op });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          resources: rows.map((r) => ({
            ...r,
            byFile: Object.fromEntries(r.byFile),
            unmatched: r.unmatched.map((o) => `${o.method} ${o.path}`),
          })),
          specs: specs.map((s) => ({ file: s.file, host: s.host, operations: s.ops.length })),
          notImplemented: missing,
        },
        null,
        2,
      ),
    );
    return;
  }

  const totalSpecOps = specs.reduce((n, s) => n + s.ops.length, 0);
  console.log(
    '| SDK resource | SDK service | Spec file | Spec host | SDK ops matched / spec ops |',
  );
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    if (r.byFile.size === 0) {
      console.log(
        `| \`${r.resource}\` | \`${r.service}\` | _none_ | — | 0 / — (${r.sdkOps} SDK ops without a spec) |`,
      );
      continue;
    }
    for (const [file, n] of r.byFile) {
      const spec = specs.find((s) => s.file === file);
      const notes = [];
      if (r.unmatched.length) notes.push(`+${r.unmatched.length} SDK ops without a spec`);
      if (r.prefixMismatch)
        notes.push(`${r.prefixMismatch} matched by path only, base path differs`);
      const extra = notes.length ? ` (${notes.join('; ')})` : '';
      console.log(
        `| \`${r.resource}\` | \`${r.service}\` | \`${file}\` | \`${spec.host}${spec.prefix}\` | ${n} / ${spec.ops.length}${extra} |`,
      );
    }
  }
  console.log();
  console.log(`Spec operations implemented by the SDK: ${implemented.size} / ${totalSpecOps}`);
  console.log();
  console.log('### Spec operations not implemented by the SDK');
  console.log();
  if (!missing.length) console.log('_none_');
  else {
    console.log('| Spec file | Operation | Summary |');
    console.log('| --- | --- | --- |');
    for (const m of missing)
      console.log(`| \`${m.file}\` | \`${m.method} ${m.path}\` | ${m.summary} |`);
  }
  console.log();
  console.log('### SDK operations without a spec');
  console.log();
  const orphan = rows.flatMap((r) =>
    r.unmatched.map((o) => ({ resource: r.resource, service: r.service, ...o })),
  );
  if (!orphan.length) console.log('_none_');
  else {
    console.log('| SDK resource | SDK service | Operation |');
    console.log('| --- | --- | --- |');
    for (const o of orphan)
      console.log(
        `| \`${o.resource}\` | \`${o.service}\` | \`${o.method} ${normalize(o.path)}\` |`,
      );
  }
}

main();
