#!/usr/bin/env node
/**
 * Captures the per-endpoint OpenAPI definitions published on the Trendyol
 * developer portal (developers.trendyol.com, a ReadMe site) into one JSON file
 * that `build-trendyol.mjs` turns into `specs/trendyol/*.json`.
 *
 * Usage:
 *   node scripts/specs/fetch-trendyol.mjs [--out trendyol-reference-capture.json]
 *        [--portal https://developers.trendyol.com]
 *
 * How it works:
 *   1. GET `<portal>/llms.txt` (ReadMe's machine-readable index) and collect every
 *      link under an `## API Reference: <definition title>` heading. These are the
 *      TR-domestic reference pages; the EN/international variants live under
 *      `/v2.0/` and `/v3.0/` and are not part of the index.
 *   2. GET each page's Markdown rendering (`<page>.md`). ReadMe embeds the full
 *      OpenAPI 3.x document of the page's API definition, filtered to that one
 *      operation, in a fenced ```json block after `# OpenAPI definition`.
 *   3. GET every TR-domestic guide page (`## Guides: …` links, `/docs/<slug>.md`)
 *      and keep its Markdown — the build needs it for guide-only definitions and
 *      to tell "observed in production" apart from "only shown in a guide example".
 *   4. Write `{ portal, fetchedAt, pages: [{ slug, url, section, title, updatedAt, openapi }],
 *      guides: [{ slug, url, title, updatedAt, markdown }] }`, both sorted by slug.
 *
 * Only the public documentation site is read; no Trendyol API is called and no
 * credentials are needed. The capture is git-ignored (see `.gitignore`), exactly
 * like the Hepsiburada portal export.
 *
 * Plain Node >= 22 (global fetch), no dependencies.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = {
    out: 'trendyol-reference-capture.json',
    portal: 'https://developers.trendyol.com',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--portal') args.portal = argv[++i].replace(/\/$/, '');
    else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/specs/fetch-trendyol.mjs [--out FILE] [--portal URL]');
      process.exit(0);
    } else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

async function get(url, attempt = 1) {
  const res = await fetch(encodeURI(url), {
    headers: { 'User-Agent': 'lonca-specs-fetch (+https://github.com/zanaat-dev/lonca)' },
  });
  if (res.ok) return res.text();
  if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return get(url, attempt + 1);
  }
  throw new Error(`GET ${url} -> ${res.status}`);
}

/**
 * llms.txt -> { reference: [{ section, title, url }], guides: [{ title, url }] }.
 * Reference links sit under `## API Reference: <definition title>` headings,
 * guide links under `## Guides: …`; only TR-domestic URLs (`/reference/`,
 * `/docs/`) are kept.
 */
function indexLinks(llms, portal) {
  const reference = [];
  const guides = [];
  let section;
  let inGuides = false;
  for (const line of llms.split('\n')) {
    if (line.startsWith('## ')) {
      const h = line.match(/^## API Reference: (.+)$/);
      section = h ? h[1].trim() : undefined;
      inGuides = line.startsWith('## Guides');
      continue;
    }
    const m = line.match(/^- \[([^\]]+)\]\((https?:\/\/[^)]+\.md)\)/);
    if (!m) continue;
    if (section && m[2].startsWith(`${portal}/reference/`))
      reference.push({ section, title: m[1], url: m[2] });
    else if (inGuides && m[2].startsWith(`${portal}/docs/`))
      guides.push({ title: m[1], url: m[2] });
  }
  return { reference, guides };
}

function slugOf(url, prefix) {
  return decodeURIComponent(new URL(encodeURI(url)).pathname)
    .replace(prefix, '')
    .replace(/\.md$/, '');
}

/** Run `task` over `items` with a small fixed concurrency (the portal is a public site; be polite). */
async function pool(items, task, concurrency = 4) {
  const queue = [...items];
  const out = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) out.push(await task(queue.shift()));
    }),
  );
  return out;
}

function parsePage(md, url) {
  const updatedAt = md.match(/^updatedAt:\s*(\S+)/m)?.[1];
  const block = md.match(/# OpenAPI definition\s*```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${url}: no "# OpenAPI definition" json block`);
  return { updatedAt, openapi: JSON.parse(block[1]) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const llms = await get(`${args.portal}/llms.txt`);
  const links = indexLinks(llms, args.portal);
  if (!links.reference.length) throw new Error('no API reference links found in llms.txt');

  const pages = await pool(links.reference, async (link) => {
    const { updatedAt, openapi } = parsePage(await get(link.url), link.url);
    return {
      slug: slugOf(link.url, /^\/reference\//),
      url: link.url.replace(/\.md$/, ''),
      section: link.section,
      title: link.title,
      updatedAt,
      openapi,
    };
  });
  // Guide pages are kept as Markdown: the build reads the hand-compiled
  // definitions' `updatedAt` from them and searches their example payloads.
  const guides = await pool(links.guides, async (link) => {
    const markdown = await get(link.url);
    return {
      slug: slugOf(link.url, /^\/docs\//),
      url: link.url.replace(/\.md$/, ''),
      title: link.title,
      updatedAt: markdown.match(/^updatedAt:\s*(\S+)/m)?.[1],
      markdown,
    };
  });
  const bySlug = (a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  pages.sort(bySlug);
  guides.sort(bySlug);

  const capture = { portal: args.portal, fetchedAt: new Date().toISOString(), pages, guides };
  writeFileSync(resolve(args.out), JSON.stringify(capture, null, 2) + '\n');
  const sections = new Set(pages.map((p) => p.section));
  console.log(
    `captured ${pages.length} reference pages in ${sections.size} sections and ` +
      `${guides.length} guide pages -> ${args.out}`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
