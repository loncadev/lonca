# Lonca brand assets

Canonical brand files for the Lonca project. Source of truth: this directory. Every other use (docs site, READMEs, package metadata) references files from here.

## Files

| File                                         | Use                                                                    | Size baseline  |
| -------------------------------------------- | ---------------------------------------------------------------------- | -------------- |
| [`lonca-icon.svg`](./lonca-icon.svg)         | Symbol mark alone (avatars, favicons, square containers, app icons)    | 24×24, scales  |
| [`lonca-wordmark.svg`](./lonca-wordmark.svg) | Word "lonca" alone (footers, tight inline contexts)                    | 83×24, scales  |
| [`lonca-logomark.svg`](./lonca-logomark.svg) | Full lockup: symbol + word (primary lockup, README headers, site logo) | 114×24, scales |

Each file ships in three flavors:

- **`*.svg`** — explicit brand color (`#2A272C`, near-black). Use on light backgrounds; do not invert.
- **`*-light.svg`** — off-white (`#FAFAF9`). For dark backgrounds — pair with `<picture>` + `prefers-color-scheme: dark` for adaptive READMEs / Starlight logos.
- **`*-mono.svg`** — `currentColor` fill, inherits the surrounding text color. Use where the surface theme can flip via CSS (inline SVG, Starlight components that propagate text color, terminal-style mixed contexts). Note: most `<img>` elements **don't** propagate `currentColor` from outside the SVG document — use the `-light.svg` variant for `<img>` in dark mode.

## Color tokens

| Token                 | Hex       | Use                                                             |
| --------------------- | --------- | --------------------------------------------------------------- |
| `brand.ink`           | `#2A272C` | Default mark color. Body-text adjacent — readable on white.     |
| `brand.surface-light` | `#FFFFFF` | Mark on white.                                                  |
| `brand.surface-dark`  | `#0F0E10` | Mark inverted on dark (use `*-mono.svg` with `color: #FFFFFF`). |

For accents and palette extension, defer to the docs site stylesheet (`docs/src/styles/custom.css`).

## Clearspace

Minimum padding around the mark = the height of the **bullet** (the small square at the bottom-right of the icon). For a 24px icon that's ~2px on every side. The lockup follows the same rule — don't crop closer.

## Do's and don'ts

- ✅ Scale uniformly (SVG handles this).
- ✅ Use `*-mono.svg` whenever the surface has a theme switch.
- ✅ Combine the icon with type in your own UI — just respect clearspace.
- ❌ Don't recolor the explicit-color files (`lonca-*.svg`). Use `*-mono.svg` and CSS instead.
- ❌ Don't stretch non-uniformly.
- ❌ Don't add drop-shadows, glows, or borders. The mark is intentionally flat.

## Where these are wired

| Surface                             | File                                                     | Where                                                             |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Docs site logo                      | `lonca-logomark.svg` (+ `-light` for dark theme)         | `docs/astro.config.mjs` → `starlight.logo`                        |
| Docs site favicon                   | `lonca-icon.svg`                                         | `docs/public/brand/lonca-icon.svg` + `astro.config.mjs` `favicon` |
| Root [README](../../README.md) hero | `lonca-logomark.svg` + `lonca-logomark-light.svg`        | `<picture>` with `prefers-color-scheme`                           |
| Per-package READMEs                 | `lonca-icon.svg` + `lonca-icon-light.svg`                | Top of file, height 32px                                          |
| GitHub repo social preview          | [`lonca-social-preview.png`](./lonca-social-preview.png) | Upload via Repo Settings → Social preview (manual one-time)       |

## Updating

Update the canonical files here, then run:

```bash
pnpm docs:sync-brand   # copies assets/brand/* → docs/public/brand/
```

(or just re-copy the files manually — the doc site needs them under `docs/public/brand/` to serve at the right URL.)
