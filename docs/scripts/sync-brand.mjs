// Mirror the brand source-of-truth (`assets/brand/*.svg`) into `docs/public/brand/`
// so Astro can serve the logos from the doc site. Run automatically before
// `pnpm docs:build` via the `prebuild` script in docs/package.json.

import { readdirSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'assets', 'brand');
const dest = join(here, '..', 'public', 'brand');

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const entry of readdirSync(src)) {
  const srcPath = join(src, entry);
  if (!statSync(srcPath).isFile()) continue;
  // Skip the brand README — it's documentation, not a served asset.
  if (entry.toLowerCase() === 'readme.md') continue;
  copyFileSync(srcPath, join(dest, entry));
  copied++;
}

console.log(`sync-brand: copied ${copied} file(s) from assets/brand/ → docs/public/brand/`);
