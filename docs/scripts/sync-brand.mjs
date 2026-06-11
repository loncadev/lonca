// Fetch the canonical Lonca brand assets from the org-wide source of truth
// (https://github.com/loncadev/.github/tree/main/brand) into `docs/public/brand/`
// so Astro can serve the logos from the doc site. No repo carries its own copy.
// Runs automatically before `pnpm dev` / `pnpm build` (predev / prebuild in
// docs/package.json). `docs/public/brand/` is gitignored — it's downloaded, not
// committed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW_BASE = 'https://raw.githubusercontent.com/loncadev/.github/main/brand';
// The assets the doc site references (logo + favicon) plus the rest of the set
// for completeness. The brand README itself is documentation, not an asset.
const FILES = ['logomark.svg', 'icon.svg', 'wordmark.svg', 'social-preview.png'];

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, '..', 'public', 'brand');
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const url = `${RAW_BASE}/${file}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'lonca-docs-sync-brand' } });
  if (!res.ok) {
    console.error(`sync-brand: ✖ ${file} — HTTP ${res.status} from ${url}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(dest, file), buf);
  copied++;
}

console.log(`sync-brand: fetched ${copied} file(s) from loncadev/.github/brand → docs/public/brand/`);
