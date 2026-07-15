# Pattern Library

An Astro site for browsing UI/UX design patterns (screenshots) from websites, apps, and games — filterable by tag and keyword-searchable.

## Inspiration

- [patterntap.com](https://patterntap.com) (RIP)
- [gameuidatabase.com](https://gameuidatabase.com)
- [interfaceingame.com](https://interfaceingame.com)
- [ui-patterns.com/patterns](https://ui-patterns.com/patterns)



## Adding a new group of images

Each website/app/game is a folder under `src/content/groups/<slug>/` containing its screenshots and one `index.md` with frontmatter describing them.

### Option A: the admin UI (recommended)

```
npm run admin
```

Opens a local-only tool at `localhost:4877` for creating groups and adding images: drag & drop files onto a group (they're saved to disk and renamed automatically — `img-01.png`, `img-02.png`, … — so you never have to think about filenames), then fill in alt text and tags per image with tag autocomplete drawn from every tag already used on the site. Everything autosaves straight back to that group's `index.md`. It's a dev-only tool (a separate Express server in `tools/admin/`, not part of the deployed Astro site) that edits the same files described below, so it's just a faster way to do option B.

### Option B: edit the files by hand

1. Create a folder: `src/content/groups/my-app-slug/`
2. Drop image files into it (jpg/png/webp/svg/gif/avif all work).
3. Create `src/content/groups/my-app-slug/index.md`:

   ```md
   ---
   title: My App
   category: app # one of: web, app, game
   url: https://example.com
   description: Optional one-line description of the app.
   images:
     - src: ./screenshot-1.png
       alt: Accessible description of what's shown
       tags: [onboarding, dark-mode]
       caption: Optional short caption shown under the thumbnail
     - src: ./screenshot-2.png
       alt: Another screenshot
       tags: [settings, light-mode]
   ---
   ```

Either way, run `npm run dev` and the new group appears automatically on the homepage, its own `/groups/my-app-slug/` page, and every tag it uses.

Tags are free-form — just type any string. New tags automatically get their own `/tags/<tag>/` page and show up as a filter chip on the homepage. No separate tag registry to maintain.

Images are processed through Astro's built-in image pipeline (resizing, lazy loading) via the `image()` schema helper, so just reference them with a relative path — no manual resizing needed.

## Commands

| Command           | Action                                      |
| ------------------ | -------------------------------------------- |
| `npm install`       | Install dependencies                         |
| `npm run dev`       | Start local dev server at `localhost:4321`   |
| `npm run admin`     | Start the local content admin UI at `localhost:4877` |
| `npm run build`     | Type-check and build the static site to `dist/` |
| `npm run preview`   | Preview the production build locally         |

## Structure

- `src/content/groups/<slug>/` — one folder per website/app/game, images + `index.md` frontmatter
- `src/content.config.ts` — schema for group frontmatter (title, category, url, description, images with tags)
- `src/lib/patterns.ts` — flattens all groups into a single image list and computes tag counts
- `src/pages/index.astro` — homepage gallery with search + tag filter
- `src/pages/groups/[slug].astro` — one page per group
- `src/pages/tags/[tag].astro` / `tags/index.astro` — tag browsing
- `src/components/` — `ImageCard` (thumbnail + lightbox trigger), `GalleryToolbar` (search + tag chips, client-side filtering), `Lightbox` (full-size view)
- `tools/admin/` — standalone Express server + vanilla-JS page for adding/tagging images without hand-editing frontmatter; reads and writes the same `src/content/groups/` files, so nothing it does is invisible to the file-based workflow above

Search and tag filtering are both handled client-side over the already-rendered gallery (no build step, no external search service) — fine at the "hundreds of images" scale this site targets. If the library grows into the thousands, consider paginating the homepage.
