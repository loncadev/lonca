#!/usr/bin/env node
/**
 * Builds `specs/trendyol/*.json` (+ `manifest.json`) from
 *
 *   1. a capture of the Trendyol developer portal's API reference pages
 *      (`scripts/specs/fetch-trendyol.mjs`; git-ignored, like the Hepsiburada dump),
 *   2. the hand-maintained inputs in `scripts/specs/trendyol/source.mjs`
 *      (definition -> file map, the `User-Agent` header, guide-only definitions,
 *      probe -> schema mapping), and
 *   3. the committed contract-probe baseline `probe-snapshots/trendyol.json`.
 *
 * Usage:
 *   node scripts/specs/build-trendyol.mjs <capture.json> [--out specs/trendyol]
 *        [--captured-at YYYY-MM-DD] [--probe probe-snapshots/trendyol.json | --no-probe]
 *        [--check]
 *
 * Every reference page embeds the OpenAPI document of its portal "API definition"
 * filtered down to that page's operation. Pages of the same definition are merged
 * back into one standalone document per definition. Operation content is copied
 * verbatim; the build only
 *   - merges paths / components / tags of the pages (and fails on any conflict),
 *   - drops the ReadMe rendering switch `x-readme`,
 *   - adds `info.x-lonca-source` and per-operation `x-lonca-doc-url` /
 *     `x-lonca-portal-updated-at`,
 *   - adds the documented `User-Agent` header parameter to every operation,
 *   - adds response properties seen in production (probe snapshot) but missing from
 *     the reference schema, marked `x-lonca-observed: true` (plus
 *     `x-lonca-guide-example: <guide url>` when a guide's example payload shows the
 *     key), and marks documented properties whose observed JSON type disagrees
 *     with `x-lonca-observed-types`,
 *   - adds the guide-only definitions compiled in `trendyol/source.mjs`,
 *   - sorts paths, methods, tags and component names.
 *
 * `--check` regenerates in memory and exits non-zero when any tracked file differs.
 * Unless `--captured-at` is given it reuses the committed manifest's date, so a
 * fresh capture (`fetch-trendyol.mjs`) + `--check` is a portal drift check.
 *
 * Plain Node >= 22, no dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  SERVICES,
  USER_AGENT_PARAMETER,
  GUIDE_DOCUMENTS,
  PROBE_OBSERVATIONS,
} from './trendyol/source.mjs';

const GENERATOR = 'scripts/specs/build-trendyol.mjs';
const METHOD_ORDER = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const USER_AGENT_REF = '#/components/parameters/UserAgent';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    capture: undefined,
    out: 'specs/trendyol',
    capturedAt: undefined,
    probe: 'probe-snapshots/trendyol.json',
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--captured-at') args.capturedAt = argv[++i];
    else if (a === '--probe') args.probe = argv[++i];
    else if (a === '--no-probe') args.probe = undefined;
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node scripts/specs/build-trendyol.mjs <capture.json> [--out DIR] ' +
          '[--captured-at YYYY-MM-DD] [--probe FILE | --no-probe] [--check]',
      );
      process.exit(0);
    } else if (!args.capture) args.capture = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!args.capture) throw new Error('missing <capture.json> argument (see --help)');
  return args;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clone = (v) => structuredClone(v);
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Key-order-independent serialisation, for conflict detection only. */
function canonical(v) {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => byCodepoint(a, b)))
      : x,
  );
}

function sortKeys(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort(byCodepoint)
      .map((k) => [k, obj[k]]),
  );
}

function collectRefs(value, into = new Set()) {
  if (Array.isArray(value)) for (const v of value) collectRefs(v, into);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') into.add(v);
      else collectRefs(v, into);
    }
  }
  return into;
}

function operations(doc) {
  const out = [];
  for (const [path, item] of Object.entries(doc.paths))
    for (const m of METHOD_ORDER) if (item[m]) out.push({ path, method: m, op: item[m] });
  return out;
}

function resolveRef(doc, schema) {
  let s = schema;
  for (let guard = 0; s && s.$ref && guard < 20; guard++) {
    const m = s.$ref.match(/^#\/components\/(\w+)\/(.+)$/);
    s = m ? doc.components?.[m[1]]?.[m[2]] : undefined;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Merge the per-page documents of one portal API definition
// ---------------------------------------------------------------------------

function mergeDefinition(definition, pages, capturedAt) {
  const first = pages[0].openapi;
  const doc = {};
  const components = {};
  const tags = new Map();
  const paths = {};
  let portalUpdatedAt = '';

  const same = (what, a, b) => {
    if (canonical(a) !== canonical(b))
      throw new Error(`${definition}: pages disagree on ${what} (${pages[0].slug} vs other page)`);
  };

  for (const page of pages) {
    const o = clone(page.openapi);
    if (o.info?.title !== definition)
      throw new Error(`${page.slug}: info.title "${o.info?.title}" != section "${definition}"`);
    for (const key of ['openapi', 'info', 'servers', 'security', 'x-owner-team', 'x-domain-key'])
      same(key, o[key], first[key]);
    if (page.updatedAt && page.updatedAt > portalUpdatedAt) portalUpdatedAt = page.updatedAt;

    for (const t of o.tags ?? []) {
      if (tags.has(t.name)) same(`tag ${t.name}`, tags.get(t.name), t);
      else tags.set(t.name, t);
    }
    for (const [kind, group] of Object.entries(o.components ?? {})) {
      components[kind] ??= {};
      for (const [name, value] of Object.entries(group)) {
        if (components[kind][name] !== undefined)
          same(`components.${kind}.${name}`, components[kind][name], value);
        else components[kind][name] = value;
      }
    }
    for (const [path, item] of Object.entries(o.paths ?? {})) {
      for (const [method, op] of Object.entries(item)) {
        paths[path] ??= {};
        if (paths[path][method]) throw new Error(`${definition}: ${method} ${path} on two pages`);
        paths[path][method] = {
          ...op,
          'x-lonca-doc-url': page.url,
          ...(page.updatedAt ? { 'x-lonca-portal-updated-at': page.updatedAt } : {}),
        };
      }
    }
  }

  // Top-level keys in the upstream order, minus the ReadMe rendering switch.
  for (const [k, v] of Object.entries(first)) {
    if (k === 'x-readme') continue;
    if (k === 'paths') doc.paths = paths;
    else if (k === 'tags') doc.tags = [...tags.values()];
    else if (k === 'components') doc.components = components;
    else doc[k] = clone(v);
  }
  doc.paths ??= paths;
  if (tags.size && !doc.tags) doc.tags = [...tags.values()];
  if (Object.keys(components).length && !doc.components) doc.components = components;

  doc.info['x-lonca-source'] = {
    kind: 'api-reference',
    portal: 'https://developers.trendyol.com',
    definition,
    pages: pages.length,
    capturedAt,
    portalUpdatedAt: portalUpdatedAt || undefined,
    generator: GENERATOR,
  };
  return doc;
}

function guideDocument(entry, capturedAt, guides) {
  const guide = guides.find((g) => g.slug === entry.guide);
  if (!guide) throw new Error(`${entry.file}: guide page "${entry.guide}" is not in the capture`);
  if (guide.updatedAt !== entry.compiledAgainst)
    console.warn(
      `WARN ${entry.file}: guide "${entry.guide}" was updated ${guide.updatedAt} ` +
        `(compiled against ${entry.compiledAgainst}) — review scripts/specs/trendyol/source.mjs`,
    );
  const doc = clone(entry.document);
  doc.info['x-lonca-source'] = {
    kind: 'guide',
    portal: 'https://developers.trendyol.com',
    guide: guide.url,
    compiledFrom: 'scripts/specs/trendyol/source.mjs',
    compiledAgainst: entry.compiledAgainst,
    capturedAt,
    portalUpdatedAt: guide.updatedAt,
    generator: GENERATOR,
  };
  for (const { op } of operations(doc))
    if (guide.updatedAt) op['x-lonca-portal-updated-at'] = guide.updatedAt;
  return doc;
}

// ---------------------------------------------------------------------------
// Lonca additions
// ---------------------------------------------------------------------------

function addUserAgent(doc) {
  doc.components ??= {};
  doc.components.parameters ??= {};
  doc.components.parameters.UserAgent = clone(USER_AGENT_PARAMETER);
  for (const { op } of operations(doc)) {
    const params = op.parameters ?? [];
    const has = params.some(
      (p) => p.$ref === USER_AGENT_REF || (p.in === 'header' && /^user-agent$/i.test(p.name ?? '')),
    );
    if (!has) op.parameters = [...params, { $ref: USER_AGENT_REF }];
  }
}

/** JSON-shape types (probe) -> whether an OpenAPI `type` accepts them. */
function typeAccepts(specType, jsonType) {
  if (jsonType === 'number') return specType === 'number' || specType === 'integer';
  return specType === jsonType;
}

/** Probe shape -> OpenAPI schema for a property the docs do not describe. */
function schemaFromShape(shape) {
  const nonNull = shape.types.filter((t) => t !== 'null');
  const nullable = shape.types.includes('null');
  let schema;
  if (nonNull.length === 0) {
    schema = { description: 'Yalnızca null değeriyle gözlemlendi; tipi bilinmiyor.' };
  } else if (nonNull.length > 1) {
    schema = { description: `Gözlemlenen JSON tipleri: ${nonNull.join(', ')}.` };
  } else if (nonNull[0] === 'object') {
    schema = { type: 'object' };
    if (shape.keys && Object.keys(shape.keys).length) {
      schema.properties = {};
      for (const [k, v] of Object.entries(shape.keys)) schema.properties[k] = schemaFromShape(v);
    }
  } else if (nonNull[0] === 'array') {
    schema = { type: 'array', items: shape.items ? schemaFromShape(shape.items) : {} };
  } else {
    schema = { type: nonNull[0] };
  }
  // OpenAPI 3.0 only allows `nullable` next to a `type`.
  if (nullable && schema.type) schema.nullable = true;
  return schema;
}

/**
 * Walk a probe shape and a spec schema side by side. Missing properties are
 * added (marked `x-lonca-observed`); documented properties whose observed JSON
 * types the documented type does not accept get `x-lonca-observed-types`.
 */
function applyShape(doc, shape, schema, where, stats, visiting = new Set()) {
  const target = resolveRef(doc, schema);
  if (!target || !shape || visiting.has(target)) return;
  visiting.add(target);
  try {
    if (shape.keys && (target.type === 'object' || target.properties)) {
      target.properties ??= {};
      for (const [key, sub] of Object.entries(shape.keys)) {
        const prop = target.properties[key];
        if (prop === undefined) {
          const added = { ...schemaFromShape(sub), 'x-lonca-observed': true };
          const keyRe = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`);
          const guide = stats.guides.find((g) => keyRe.test(g.markdown));
          if (guide) {
            added['x-lonca-guide-example'] = guide.url;
            stats.inGuideExamples.push(`${where}.${key}`);
          }
          target.properties[key] = added;
          stats.properties.push(`${where}.${key}`);
          continue;
        }
        const resolved = resolveRef(doc, prop);
        if (!prop.$ref && resolved?.type) {
          const bad = sub.types.filter((t) =>
            t === 'null' ? !resolved.nullable : !typeAccepts(resolved.type, t),
          );
          if (bad.length) {
            prop['x-lonca-observed-types'] = sub.types;
            stats.typeMismatches.push(`${where}.${key}`);
          }
        }
        applyShape(doc, sub, prop, `${where}.${key}`, stats, visiting);
      }
    }
    if (shape.items && (target.type === 'array' || target.items)) {
      if (!target.items) target.items = {};
      applyShape(doc, shape.items, target.items, `${where}[]`, stats, visiting);
    }
  } finally {
    visiting.delete(target);
  }
}

function shapeAt(shape, path) {
  let s = shape;
  for (const seg of path.split('.')) {
    const m = seg.match(/^(\w*)((?:\[\])*)$/);
    if (!m) throw new Error(`bad shape path segment ${seg}`);
    if (m[1]) s = s?.keys?.[m[1]];
    for (let i = 0; i < m[2].length / 2; i++) s = s?.items;
  }
  return s;
}

function schemaAt(doc, root, path) {
  let s = root;
  for (const seg of path.split('.')) {
    const m = seg.match(/^(\w*)((?:\[\])*)$/);
    if (m[1]) s = resolveRef(doc, s)?.properties?.[m[1]];
    for (let i = 0; i < m[2].length / 2; i++) s = resolveRef(doc, s)?.items;
  }
  return s;
}

const emptyStats = () => ({ properties: [], inGuideExamples: [], typeMismatches: [] });

function applyObservations(docs, snapshot, guides) {
  const statsByFile = new Map();
  for (const entry of PROBE_OBSERVATIONS) {
    const probe = snapshot.probes?.[entry.probe];
    if (!probe || probe.status !== 'ok' || !probe.shape) {
      console.warn(`skip observation ${entry.probe}: no successful probe in the snapshot`);
      continue;
    }
    const doc = docs.get(entry.file);
    if (!doc) throw new Error(`observation ${entry.probe}: unknown file ${entry.file}`);
    const [method, path] = entry.operation.split(' ');
    const op = doc.paths[path]?.[method];
    if (!op) throw new Error(`observation ${entry.probe}: ${entry.operation} not in ${entry.file}`);
    const root = op.responses?.['200']?.content?.['application/json']?.schema;
    const schema = schemaAt(doc, root, entry.schema);
    const shape = shapeAt(probe.shape, entry.raw);
    if (!schema) throw new Error(`observation ${entry.probe}: schema path ${entry.schema} missing`);
    if (!shape) throw new Error(`observation ${entry.probe}: shape path ${entry.raw} missing`);
    const entryGuides = (entry.guides ?? []).map((suffix) => {
      const hits = guides.filter((g) => g.slug === suffix || g.slug.endsWith(`-${suffix}`));
      if (hits.length !== 1)
        throw new Error(
          `observation ${entry.probe}: guide "${suffix}" matches ${hits.length} pages`,
        );
      return hits[0];
    });
    const stats = statsByFile.get(entry.file) ?? emptyStats();
    applyShape(doc, shape, schema, `${entry.operation} ${entry.schema}`, {
      ...stats,
      guides: entryGuides,
    });
    statsByFile.set(entry.file, stats);
  }
  return statsByFile;
}

// ---------------------------------------------------------------------------
// Normalise + validate
// ---------------------------------------------------------------------------

function finalize(file, doc) {
  const ordered = {};
  for (const p of Object.keys(doc.paths).sort(byCodepoint)) {
    ordered[p] = {};
    for (const m of METHOD_ORDER) if (doc.paths[p][m]) ordered[p][m] = doc.paths[p][m];
  }
  doc.paths = ordered;
  if (doc.tags) doc.tags = [...doc.tags].sort((a, b) => byCodepoint(a.name, b.name));
  if (doc.components) {
    for (const kind of Object.keys(doc.components))
      doc.components[kind] = sortKeys(doc.components[kind]);
    doc.components = sortKeys(doc.components);
  }

  // Every local $ref must resolve; external refs are not allowed.
  const dangling = [...collectRefs(doc)].filter((ref) => {
    const m = ref.match(/^#\/components\/(\w+)\/(.+)$/);
    return !m || doc.components?.[m[1]]?.[m[2]] === undefined;
  });
  if (dangling.length) throw new Error(`${file}: unresolved $ref(s): ${dangling.join(', ')}`);

  // Every {param} in a path template must be declared `in: path`.
  for (const { path, method, op } of operations(doc)) {
    const declared = new Set(
      (op.parameters ?? [])
        .map((p) => resolveRef(doc, p))
        .filter((p) => p?.in === 'path')
        .map((p) => p.name),
    );
    for (const [, name] of path.matchAll(/\{([^}]+)\}/g))
      if (!declared.has(name))
        throw new Error(`${file}: ${method} ${path} does not declare path parameter {${name}}`);
    if (!op.responses || !Object.keys(op.responses).length)
      throw new Error(`${file}: ${method} ${path} has no responses`);
  }
  return doc;
}

function countObservedOperations(doc) {
  return operations(doc).filter(({ op }) => op['x-lonca-observed'] === true).length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const capture = JSON.parse(readFileSync(resolve(args.capture), 'utf8'));
  const outDir = resolve(args.out);
  // `--check` against a fresh capture should report content drift, not a new
  // date: default to the committed manifest's capturedAt in that mode.
  const committedManifest = join(outDir, 'manifest.json');
  const capturedAt =
    args.capturedAt ??
    (args.check && existsSync(committedManifest)
      ? JSON.parse(readFileSync(committedManifest, 'utf8')).capturedAt
      : String(capture.fetchedAt).slice(0, 10));

  // 1. One document per portal API definition.
  const bySection = new Map();
  for (const page of capture.pages) {
    if (!bySection.has(page.section)) bySection.set(page.section, []);
    bySection.get(page.section).push(page);
  }
  const docs = new Map(); // file -> doc
  const meta = new Map(); // file -> manifest fields
  for (const [definition, pages] of [...bySection].sort(([a], [b]) => byCodepoint(a, b))) {
    const file = SERVICES[definition];
    if (!file) throw new Error(`no output file mapped for portal definition "${definition}"`);
    pages.sort((a, b) => byCodepoint(a.slug, b.slug));
    docs.set(file, mergeDefinition(definition, pages, capturedAt));
    meta.set(file, { kind: 'api-reference', definition, pages: pages.map((p) => p.slug) });
  }
  for (const entry of GUIDE_DOCUMENTS) {
    if (docs.has(entry.file)) throw new Error(`${entry.file}: produced twice`);
    docs.set(entry.file, guideDocument(entry, capturedAt, capture.guides ?? []));
    meta.set(entry.file, {
      kind: 'guide',
      definition: entry.document.info.title,
      pages: [entry.guide],
    });
  }

  // 2. Lonca additions.
  for (const doc of docs.values()) addUserAgent(doc);
  let observation = new Map();
  let snapshotEnv;
  if (args.probe) {
    const snapshot = JSON.parse(readFileSync(resolve(args.probe), 'utf8'));
    snapshotEnv = snapshot.env;
    observation = applyObservations(docs, snapshot, capture.guides ?? []);
    for (const [file, stats] of observation) {
      if (!stats.properties.length && !stats.typeMismatches.length) continue;
      docs.get(file).info['x-lonca-observed-source'] = {
        snapshot: args.probe.replace(/\\/g, '/'),
        env: snapshotEnv,
        note:
          'Properties marked x-lonca-observed were seen in production responses but are not in ' +
          'the API reference schema; x-lonca-guide-example names the guide page whose example ' +
          'payload shows the same key (absent: not documented anywhere). x-lonca-observed-types ' +
          'lists the JSON types seen where they disagree with the documented type.',
      };
    }
  }

  // 3. Serialise.
  const outputs = new Map();
  const manifest = {
    marketplace: 'trendyol',
    portal: 'https://developers.trendyol.com',
    index: 'https://developers.trendyol.com/llms.txt',
    capturedAt,
    generator: GENERATOR,
    source: 'scripts/specs/trendyol/source.mjs',
    probeSnapshot: args.probe ? { file: args.probe.replace(/\\/g, '/'), env: snapshotEnv } : null,
    files: [],
  };
  for (const file of [...docs.keys()].sort(byCodepoint)) {
    const doc = finalize(file, docs.get(file));
    outputs.set(file, JSON.stringify(doc, null, 2) + '\n');
    const stats = observation.get(file) ?? emptyStats();
    const ops = operations(doc);
    manifest.files.push({
      file,
      ...meta.get(file),
      title: doc.info.title,
      servers: (doc.servers ?? []).map((s) => s.url),
      paths: Object.keys(doc.paths).length,
      operations: ops.length,
      schemas: Object.keys(doc.components?.schemas ?? {}).length,
      observed: {
        operations: countObservedOperations(doc),
        properties: stats.properties.length,
        propertiesInGuideExamples: stats.inGuideExamples.length,
        typeMismatches: stats.typeMismatches.length,
      },
      portalUpdatedAt: doc.info['x-lonca-source'].portalUpdatedAt,
    });
  }
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
      console.error(`${drift} file(s) differ from the capture`);
      process.exit(1);
    }
    console.log(`ok: ${outputs.size} files match the capture`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [file, text] of outputs) writeFileSync(join(outDir, file), text);
  for (const f of manifest.files) {
    console.log(
      `${f.file.padEnd(32)} ${String(f.operations).padStart(3)} ops  ${String(f.paths).padStart(3)} paths  ` +
        `${String(f.schemas).padStart(3)} schemas  observed ${f.observed.properties} ` +
        `(${f.observed.propertiesInGuideExamples} in guide examples), ` +
        `${f.observed.typeMismatches} type mismatches  ` +
        f.servers.join(', '),
    );
  }
  console.log(`wrote ${outputs.size} files to ${outDir} (capturedAt=${capturedAt})`);
}

main();
