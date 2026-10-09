#!/usr/bin/env node
/**
 * Cross-checks `specs/trendyol/*.json` against the `@lonca/trendyol` SDK.
 *
 * Usage:
 *   node scripts/specs/coverage-trendyol.mjs [--specs specs/trendyol]
 *        [--resources sdks/trendyol/src/resources] [--json]
 *
 * Prints (as Markdown, or JSON with `--json`):
 *   1. resource -> spec file -> implemented / total operations
 *   2. spec operations the SDK does not implement
 *   3. SDK operations that have no spec
 *
 * The SDK side is derived from the resource sources:
 *   - private path helpers (`private fooPath(id): string { return `...`; }`) are
 *     inlined first;
 *   - every `path:` property is paired with the `method:` written next to it;
 *   - private request helpers whose `path:` is (or interpolates) their first
 *     string parameter (`queryPage(path, …)`, `submitWrite(endpoint, …)`,
 *     `cities(path)`, …) are expanded at each `this.helper('/literal', …)` call.
 * Paths are compared case-sensitively with every path parameter and template
 * expression collapsed to `{}`; the spec path is prefixed with the base path of
 * its `servers[0].url` (e.g. `/integration`, `/integration/webhook`).
 *
 * Plain Node >= 18, no dependencies.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

function parseArgs(argv) {
  const args = { specs: 'specs/trendyol', resources: 'sdks/trendyol/src/resources', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--specs') args.specs = argv[++i];
    else if (a === '--resources') args.resources = argv[++i];
    else if (a === '--json') args.json = true;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

/** `/order/sellers/${this.transport.sellerId}/x/{id}` -> `/order/sellers/{}/x/{}` */
function normalize(path) {
  return path
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/+$/, '');
}

const isComment = (l) => /^\s*(\*|\/\/|\/\*)/.test(l);

/** Inline `this.xPath(…)` helpers that just return a template literal. */
function inlinePathHelpers(src) {
  const helpers = [
    ...src.matchAll(/private (\w+Path)\([^)]*\): string \{\s*return (`[^`]*`);\s*\}/g),
  ];
  let out = src;
  for (const [, name, literal] of helpers) {
    const body = literal.slice(1, -1);
    // `${this.packagePath(id)}/split` -> `<body>/split`
    out = out.replace(new RegExp(`\\$\\{this\\.${name}\\([^)]*\\)\\}`, 'g'), body);
    // `path: this.packagePath(id),` -> `path: `<body>`,`
    out = out.replace(new RegExp(`this\\.${name}\\([^)]*\\)`, 'g'), `\`${body}\``);
  }
  return out;
}

/** Private request helpers: `name(param: string, …)` whose request path uses `param`. */
function requestHelpers(lines) {
  const helpers = [];
  lines.forEach((line, idx) => {
    // `private async name<T>(path: string, …)` — the parameter may sit on the next line.
    const m = line.match(/^\s*private (?:async )?(\w+)(?:<[^>]*>)?\(\s*(?:(\w+): string)?/);
    if (!m) return;
    const name = m[1];
    const param = m[2] ?? lines[idx + 1]?.match(/^\s*(\w+): string,?\s*$/)?.[1];
    if (!param) return;
    let method;
    let template;
    for (let i = idx; i < Math.min(lines.length, idx + 60); i++) {
      if (i > idx && /^\s{2}(private |async |get |\w+\()/.test(lines[i])) break;
      method ??= lines[i].match(/method:\s*'([A-Z]+)'/)?.[1];
      const p = lines[i].match(/^\s*path(?::\s*(?:`([^`]*)`|(\w+)))?,?\s*$/);
      if (p) template = p[1] ?? p[2] ?? 'path';
    }
    if (!method || !template) return;
    if (template === param) template = '${' + param + '}';
    if (!template.includes('${' + param + '}')) return;
    helpers.push({ name, param, method, template });
  });
  return helpers;
}

/** Extract `{ method, path, key }` entries from one resource source. */
function scanResource(file) {
  const src = inlinePathHelpers(readFileSync(file, 'utf8'));
  const lines = src.split('\n');
  const helpers = requestHelpers(lines);
  const ops = [];

  lines.forEach((line, idx) => {
    if (isComment(line)) return;
    // 1. `path: `...`` next to a `method:` (skip helper bodies that use their param).
    const prop = line.match(/path:\s*(?:`([^`]*)`|'([^']*)')/);
    if (prop) {
      const path = prop[1] ?? prop[2];
      if (helpers.some((h) => path.includes('${' + h.param + '}'))) return;
      let method;
      for (let back = 0; back <= 8 && idx - back >= 0 && !method; back++)
        method = lines[idx - back].match(/method:\s*'([A-Z]+)'/)?.[1];
      for (let fwd = 1; fwd <= 3 && idx + fwd < lines.length && !method; fwd++)
        method = lines[idx + fwd].match(/method:\s*'([A-Z]+)'/)?.[1];
      if (method && path.startsWith('/')) ops.push({ method, path, line: idx + 1 });
      return;
    }
    // 2. `this.helper('/literal', …)` or `this.helper(` + literal on the next line.
    for (const h of helpers) {
      const call = new RegExp(`this\\.${h.name}\\(\\s*(?:\`([^\`]*)\`|'([^']*)')?`).exec(line);
      if (!call) continue;
      let literal = call[1] ?? call[2];
      if (literal === undefined) {
        const next = lines[idx + 1]?.match(/^\s*(?:`([^`]*)`|'([^']*)')/);
        literal = next ? (next[1] ?? next[2]) : undefined;
      }
      if (literal === undefined) continue;
      ops.push({
        method: h.method,
        path: h.template.replace('${' + h.param + '}', literal),
        line: idx + 1,
      });
    }
  });

  const seen = new Map();
  for (const op of ops) {
    const key = `${op.method} ${normalize(op.path)}`;
    if (!seen.has(key)) seen.set(key, { ...op, key });
  }
  return { resource: basename(file, '.ts'), ops: [...seen.values()] };
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
          summary: op.summary ?? '',
          operationId: op.operationId,
        });
      }
    }
    specs.push({ file: f, prefix, ops });
  }
  return specs.sort((a, b) => a.file.localeCompare(b.file));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const resourcesDir = resolve(args.resources);
  const resources = readdirSync(resourcesDir)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .sort()
    .map((f) => scanResource(join(resourcesDir, f)));
  const specs = loadSpecs(resolve(args.specs));

  const specIndex = new Map();
  for (const s of specs) for (const op of s.ops) specIndex.set(op.key, { file: s.file, op });

  const implemented = new Set();
  const rows = [];
  for (const r of resources) {
    const byFile = new Map();
    const unmatched = [];
    for (const op of r.ops) {
      const hit = specIndex.get(op.key);
      if (hit) {
        implemented.add(hit.op.key);
        byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
      } else unmatched.push(op);
    }
    rows.push({ resource: r.resource, sdkOps: r.ops.length, byFile, unmatched });
  }

  const missing = [];
  for (const s of specs)
    for (const op of s.ops) if (!implemented.has(op.key)) missing.push({ file: s.file, ...op });
  const totalSpecOps = specs.reduce((n, s) => n + s.ops.length, 0);
  const totalSdkOps = rows.reduce((n, r) => n + r.sdkOps, 0);
  const matchedSdkOps = rows.reduce((n, r) => n + r.sdkOps - r.unmatched.length, 0);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          resources: rows.map((r) => ({
            ...r,
            byFile: Object.fromEntries(r.byFile),
            unmatched: r.unmatched.map((o) => `${o.method} ${o.path}`),
          })),
          specs: specs.map((s) => ({ file: s.file, prefix: s.prefix, operations: s.ops.length })),
          notImplemented: missing,
          totals: { sdkOps: totalSdkOps, matchedSdkOps, specOps: totalSpecOps },
        },
        null,
        2,
      ),
    );
    return;
  }

  const opsIn = (file) => specs.find((s) => s.file === file).ops.length;
  console.log('| SDK resource | Spec file | Base path | SDK ops matched / spec ops |');
  console.log('| --- | --- | --- | --- |');
  for (const r of rows) {
    if (r.byFile.size === 0) {
      console.log(
        `| \`${r.resource}\` | _none_ | — | 0 / — (${r.sdkOps} SDK ops without a spec) |`,
      );
      continue;
    }
    for (const [file, n] of r.byFile) {
      const spec = specs.find((s) => s.file === file);
      const extra = r.unmatched.length ? ` (+${r.unmatched.length} SDK ops without a spec)` : '';
      console.log(
        `| \`${r.resource}\` | \`${file}\` | \`${spec.prefix}\` | ${n} / ${opsIn(file)}${extra} |`,
      );
    }
  }
  console.log();
  console.log(`SDK operations with a spec: ${matchedSdkOps} / ${totalSdkOps}`);
  console.log(`Spec operations implemented by the SDK: ${implemented.size} / ${totalSpecOps}`);
  console.log();
  console.log('### Spec operations not implemented by the SDK');
  console.log();
  if (!missing.length) console.log('_none_');
  else {
    console.log('| Spec file | Operation | operationId | Summary |');
    console.log('| --- | --- | --- | --- |');
    for (const m of missing)
      console.log(
        `| \`${m.file}\` | \`${m.method} ${m.path}\` | \`${m.operationId ?? ''}\` | ${m.summary} |`,
      );
  }
  console.log();
  console.log('### SDK operations without a spec');
  console.log();
  const orphan = rows.flatMap((r) => r.unmatched.map((o) => ({ resource: r.resource, ...o })));
  if (!orphan.length) console.log('_none_');
  else {
    console.log('| SDK resource | Operation |');
    console.log('| --- | --- |');
    for (const o of orphan)
      console.log(`| \`${o.resource}\` | \`${o.method} ${normalize(o.path)}\` |`);
  }
}

main();
