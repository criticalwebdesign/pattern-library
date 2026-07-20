# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — dev server at `localhost:4321` (served under the `/pattern-library/` base path, same as production — see Deployment below)
- `npm run admin` — local content admin UI at `localhost:4877` (dev-only Express server, not part of the deployed site)
- `npm run build` — runs `astro check && astro build`; a type error anywhere fails the whole thing (not just `astro check`), which also fails the GitHub Pages deploy
- `npm run preview` — preview the production build locally
- `npm run admin:prune` — deletes orphaned image files no longer referenced by any group's frontmatter; run only while the dev server is **stopped** (see Admin tool below)

There is no automated test suite. Verify changes by actually driving the dev/admin server (`curl`, or a headless browser) rather than relying on `astro check` alone.

## Architecture

### Content model

All content lives under `src/content/groups/<slug>/` — an `index.md` (frontmatter only, no body) plus its screenshot files, validated by the collection schema in `src/content.config.ts` (Astro content collection using the `glob` loader; a group's id is its folder name). Fields: `title`, `category` (enum: web/app/game/material), `platform` (optional enum: mobile/console/desktop/browser), `author` (optional), `url`/`trailerUrl` (optional, validated URLs), `description` (optional), and `images[]` (`src` via the `image()` schema helper, `alt`, `tags[]`, optional `caption`).

`src/lib/patterns.ts`'s `getAllImages()` flattens every group into a single `PatternImage[]` — this is the one source of truth consumed by the homepage and all tag pages. Notably, it merges each group's `category` and `platform` into every one of its images' `tags` automatically, so a tag chip like `mobile` or `game` may not appear literally in any image's own `tags` list — it's synthesized here. `getTagCounts()` derives the tag cloud from that same flattened list.

### Pages

- `src/pages/index.astro` — homepage: full gallery + `GalleryToolbar` (search + tag filter, client-side only, no pagination — fine at the "hundreds of images" scale this targets)
- `src/pages/groups/[slug].astro` — one static page per group; renders an optional trailer via `resolveVideoEmbed()` (`src/lib/video.ts`), which turns a YouTube/Vimeo/direct-file URL into the right embed kind
- `src/pages/tags/[tag].astro` / `tags/index.astro` — tag browsing, same client-side gallery/toolbar pattern as the homepage

### GalleryToolbar (`src/components/GalleryToolbar.astro`)

Tag chips are mutually exclusive — clicking one deselects any other and pushes `/tags/<tag>/` into the URL via `history.pushState` (base-path-prefixed via a `data-base` attribute sourced from `import.meta.env.BASE_URL`), with a `popstate` listener to keep chip state in sync with back/forward. Search text is filtered client-side but is *not* reflected in the URL.

### Lightbox

`src/components/ImageCard.astro` renders each thumbnail plus a hidden sibling node (`data-lightbox-content`) holding the full-size version. `src/components/Lightbox.astro` clones the matching hidden node into a `<dialog>` on click and implements prev/next by walking sibling `[data-lightbox-trigger]` elements in DOM order. **The admin tool has its own separate lightbox implementation** (`tools/admin/public/index.html` + `app.js`) that does not share code with this one — a lightbox change on the public site does not carry over to the admin UI or vice versa.

### Deployment (GitHub Pages)

`astro.config.mjs` sets `site` and `base: '/pattern-library/'` (a project page under the `criticalwebdesign` org). The trailing slash on `base` matters — `import.meta.env.BASE_URL` is used verbatim everywhere an absolute internal link is built (nav in `Base.astro`, `ImageCard`, `tags/index.astro`, the toolbar's `pushState` target); a hardcoded `href="/..."` will 404 once deployed instead of respecting the base path.

`.github/workflows/deploy.yml` builds via `withastro/action` and deploys via `actions/deploy-pages` on every push to `main`. The repo's Settings → Pages → Source must be set to "GitHub Actions" (a one-time setting outside this repo, not something a workflow file controls).

### Admin tool (`tools/admin/`) — dev-only, not part of the deployed site

A standalone Express server (`server.mjs`) plus a vanilla JS/HTML frontend (`public/`), started with `npm run admin` on port 4877. It reads and writes the exact same `src/content/groups/*/index.md` and image files as the hand-edit workflow — there's no separate database, so nothing it does is invisible to someone editing files directly.

Image uploads: HEIC/HEIF (via `heic-convert`) and TIFF (via `sharp`) are auto-converted to PNG on upload; other formats are stored as-is. Filenames are auto-assigned (`img-01.png`, `img-02.png`, …).

Deleting an image through the admin API removes it from the group's frontmatter but **deliberately leaves the file on disk** — Astro's dev server caches image imports for the life of the process and crashes if a referenced file disappears mid-session. Run `npm run admin:prune` to actually remove orphaned files, and only while the dev server is stopped.

### Gotchas

- **Port conflicts**: `npm run dev` (4321) and `npm run admin` (4877) are often left running across sessions. Check `lsof -i :4321` / `lsof -i :4877` before starting another instance — otherwise you'll hit `EADDRINUSE`.
- **`.astro/` is tracked in git** (`content-assets.mjs`, `data-store.json`). Running `astro dev`/`check`/`build` regenerates it and shows up as a diff — that's just cache churn, not a real change. Safe to `git checkout -- .astro/` before committing unless you intentionally changed `content.config.ts`.
