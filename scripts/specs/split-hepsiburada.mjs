#!/usr/bin/env node
/**
 * Regenerates `specs/hepsiburada/*.json` from a Hepsiburada developer-portal dump.
 *
 * Usage:
 *   node scripts/specs/split-hepsiburada.mjs <dump.json> [--out specs/hepsiburada]
 *        [--captured-at YYYY-MM-DD] [--check]
 *
 * The dump is the raw export of developers.hepsiburada.com "API definitions"
 * (kept out of git — see `.gitignore`). Its shape is
 *
 *   { "<productSlug>": [ { data, parameters, requestBody, responses, components, linkedGuide }, ... ] }
 *
 * where every array element is one operation and `components` is the product's
 * complete schema set (identical across the product's operations).
 *
 * Each product becomes one standalone OpenAPI 3.0.3 document. Operation content
 * is copied verbatim; the only transformations are structural (portal record ->
 * OpenAPI object), dropping `null`s, and pruning `components.schemas` to the
 * schemas transitively referenced by the product's operations. See
 * `specs/hepsiburada/README.md` for the full list of what is kept and dropped.
 *
 * `--check` regenerates in memory and exits non-zero if any tracked file differs
 * from the dump (useful for drift detection or CI).
 *
 * Plain Node >= 18, no dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const OPENAPI_VERSION = '3.0.3';
const METHOD_ORDER = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Portal product slug -> output file. Names follow the service host that the
 * product's code samples target (see `servers[0].url` in each output file).
 * Unknown products fall back to `<productSlug>.json`.
 */
const FILE_BY_PRODUCT = {
  'siparis-olusturma-entegrasyonu': 'oms-external.json',
  'katalog-urun-entegrasyonu': 'mpop-catalog.json',
  'urun-guncelleme-entegrasyonu': 'mpop-product-updates.json',
  'tedarikci-entegrasyonu': 'supplier-api-external.json',
  'muhasebe-entegrasyonu': 'mpfinance-external.json',
  'saticiya-sor-entegrasyonu': 'asktoseller-merchant.json',
  'satici-promosyonu-entegrasyonu': 'diskonto-external.json',
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: 'specs/hepsiburada', check: false, capturedAt: undefined, dump: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--captured-at') args.capturedAt = argv[++i];
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node scripts/specs/split-hepsiburada.mjs <dump.json> [--out DIR] [--captured-at YYYY-MM-DD] [--check]',
      );
      process.exit(0);
    } else if (!args.dump) args.dump = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!args.dump) throw new Error('missing <dump.json> argument (see --help)');
  return args;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shallow copy without `null`/`undefined` values, preserving key order. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

function collectRefs(value, into) {
  if (Array.isArray(value)) for (const v of value) collectRefs(v, into);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') into.add(v);
      else collectRefs(v, into);
    }
  }
  return into;
}

/** Escape a path template so it can be located inside a concrete sample URL. */
function pathToRegex(path) {
  const escaped = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/?"]+');
  return new RegExp(escaped);
}

/**
 * The portal records do not carry a `servers` block; the only place the target
 * host appears is in the generated code samples. Derive the base URL by
 * stripping the operation path from the cURL sample URL.
 */
function deriveServerUrl(record) {
  const curl = record.data.codeExamples?.curl ?? '';
  const m = curl.match(/"(https?:\/\/[^"]+)"/);
  if (!m) return undefined;
  const url = m[1];
  const hit = pathToRegex(record.data.path).exec(url);
  return hit ? url.slice(0, hit.index).replace(/\/$/, '') : undefined;
}

function securityScheme(sec) {
  // Portal shape: { type: 'http', scheme: 'basic'|'bearer', bearerFormat, description, name, in }
  // `name`/`in` are meaningless for `type: http` and are dropped.
  const name = sec.scheme === 'bearer' ? 'bearerAuth' : `${sec.scheme}Auth`;
  const scheme = compact({
    type: sec.type,
    scheme: sec.scheme,
    bearerFormat: sec.bearerFormat,
    description: sec.description,
  });
  return { name, scheme };
}

function convertParameter(p) {
  return compact({
    name: p.name,
    in: p.in,
    description: p.description,
    required: p.required,
    deprecated: p.deprecated,
    schema: p.schema,
    example: p.example,
  });
}

function convertContent(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const content = {};
  for (const c of list) content[c.contentType] = compact({ schema: c.schema, example: c.example });
  return content;
}

function convertRequestBody(rb) {
  if (!rb) return undefined;
  return compact({
    description: rb.description,
    required: rb.required,
    content: convertContent(rb.content),
  });
}

function convertResponses(list) {
  const out = {};
  for (const r of list ?? []) {
    out[String(r.code)] = compact({
      description: r.description ?? '',
      content: convertContent(r.content),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product -> OpenAPI document
// ---------------------------------------------------------------------------

function buildDocument(productSlug, records, capturedAt) {
  const first = records[0].data;
  const servers = new Set();
  const securitySchemes = {};
  const tags = new Map();
  const paths = {};
  let lastUpdated = '';

  for (const rec of records) {
    const d = rec.data;
    const server = deriveServerUrl(rec);
    if (server) servers.add(server);
    if (d.updatedAt && d.updatedAt > lastUpdated) lastUpdated = d.updatedAt;

    const security = [];
    for (const sec of d.security ?? []) {
      const { name, scheme } = securityScheme(sec);
      securitySchemes[name] = scheme;
      security.push({ [name]: [] });
    }
    if (d.tag) tags.set(d.tag, { name: d.tag });

    const operation = compact({
      tags: d.tag ? [d.tag] : undefined,
      summary: d.summary ?? d.title,
      description: d.description,
      operationId: d.operationId,
      deprecated: d.deprecated,
      parameters: rec.parameters?.length ? rec.parameters.map(convertParameter) : undefined,
      requestBody: convertRequestBody(rec.requestBody),
      responses: convertResponses(rec.responses),
      security: security.length ? security : undefined,
      'x-lonca-portal-updated-at': d.updatedAt,
    });

    const method = String(d.method).toLowerCase();
    (paths[d.path] ??= {})[method] = operation;
  }

  // Stable ordering: paths alphabetically, methods in the OpenAPI canonical order.
  const orderedPaths = {};
  for (const p of Object.keys(paths).sort()) {
    orderedPaths[p] = {};
    for (const m of METHOD_ORDER) if (paths[p][m]) orderedPaths[p][m] = paths[p][m];
  }

  // components.schemas pruned to what the operations reference (transitively).
  const allSchemas = records[0].components?.schemas ?? {};
  const wanted = new Set();
  const queue = [...collectRefs(orderedPaths, new Set())];
  const dangling = [];
  while (queue.length) {
    const ref = queue.pop();
    if (wanted.has(ref)) continue;
    wanted.add(ref);
    const prefix = '#/components/schemas/';
    if (!ref.startsWith(prefix)) {
      dangling.push(ref);
      continue;
    }
    const schema = allSchemas[ref.slice(prefix.length)];
    if (!schema) {
      dangling.push(ref);
      continue;
    }
    for (const r of collectRefs(schema, new Set())) queue.push(r);
  }
  if (dangling.length) {
    throw new Error(`${productSlug}: unresolved $ref(s): ${dangling.join(', ')}`);
  }
  const schemas = {};
  for (const name of Object.keys(allSchemas).sort()) {
    if (wanted.has(`#/components/schemas/${name}`)) schemas[name] = allSchemas[name];
  }

  const serverList = [...servers].sort();
  const doc = {
    openapi: OPENAPI_VERSION,
    info: compact({
      title: `Hepsiburada ${productSlug}`,
      version: first.version,
      description:
        `Hepsiburada developer-portal API definition for product "${productSlug}" ` +
        `(category "${first.categorySlug}"), redistributed unchanged for interoperability. ` +
        'Copyright Hepsiburada; not covered by the lonca repository licence. ' +
        'See specs/hepsiburada/README.md.',
      'x-lonca-source': compact({
        portal: 'https://developers.hepsiburada.com',
        companySlug: first.companySlug,
        categorySlug: first.categorySlug,
        productSlug,
        versionLabel: first.version,
        capturedAt,
        portalUpdatedAt: lastUpdated || undefined,
        generator: 'scripts/specs/split-hepsiburada.mjs',
      }),
    }),
    servers: serverList.map((url) => ({
      url,
      description: 'Sandbox (SIT) host as published in the portal code samples',
    })),
    tags: [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    paths: orderedPaths,
    components: compact({
      securitySchemes: Object.keys(securitySchemes).length ? securitySchemes : undefined,
      schemas: Object.keys(schemas).length ? schemas : undefined,
    }),
  };
  if (!doc.components || Object.keys(doc.components).length === 0) delete doc.components;

  const operationCount = Object.values(orderedPaths).reduce(
    (n, item) => n + Object.keys(item).length,
    0,
  );
  return {
    doc,
    stats: {
      operations: operationCount,
      paths: Object.keys(orderedPaths).length,
      schemas: Object.keys(schemas).length,
      schemasInDump: Object.keys(allSchemas).length,
      servers: serverList,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dumpPath = resolve(args.dump);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
  const capturedAt = args.capturedAt ?? statSync(dumpPath).mtime.toISOString().slice(0, 10);
  const outDir = resolve(args.out);

  const manifest = {
    marketplace: 'hepsiburada',
    portal: 'https://developers.hepsiburada.com',
    capturedAt,
    generator: 'scripts/specs/split-hepsiburada.mjs',
    files: [],
  };
  const outputs = new Map();

  for (const productSlug of Object.keys(dump).sort()) {
    const records = dump[productSlug];
    if (!Array.isArray(records) || records.length === 0) {
      console.warn(`skip ${productSlug}: no operations in dump`);
      continue;
    }
    const file = FILE_BY_PRODUCT[productSlug] ?? `${productSlug}.json`;
    const { doc, stats } = buildDocument(productSlug, records, capturedAt);
    outputs.set(file, JSON.stringify(doc, null, 2) + '\n');
    manifest.files.push({
      file,
      productSlug,
      categorySlug: records[0].data.categorySlug,
      title: doc.info.title,
      servers: stats.servers,
      paths: stats.paths,
      operations: stats.operations,
      schemas: stats.schemas,
      portalUpdatedAt: doc.info['x-lonca-source'].portalUpdatedAt,
    });
  }
  manifest.files.sort((a, b) => a.file.localeCompare(b.file));
  outputs.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  if (args.check) {
    let drift = 0;
    for (const [file, text] of outputs) {
      const target = join(outDir, file);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (current !== text) {
        drift++;
        console.error(`DRIFT ${file}${current === null ? ' (missing)' : ''}`);
      }
    }
    if (drift) {
      console.error(`${drift} file(s) differ from the dump`);
      process.exit(1);
    }
    console.log(`ok: ${outputs.size} files match the dump`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [file, text] of outputs) writeFileSync(join(outDir, file), text);
  for (const f of manifest.files) {
    console.log(
      `${f.file.padEnd(28)} ${String(f.operations).padStart(3)} ops  ${String(f.paths).padStart(3)} paths  ${String(f.schemas).padStart(3)} schemas  ${f.servers.join(', ')}`,
    );
  }
  console.log(`wrote ${outputs.size} files to ${outDir} (capturedAt=${capturedAt})`);
}

main();
