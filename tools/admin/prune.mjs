import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

// Deletes group image files that are no longer referenced by their
// group's index.md. The admin server leaves deleted images on disk (see
// tools/admin/server.mjs) to avoid crashing Astro's dev server, which caches
// image imports for the life of the process and never notices a file went
// missing. Run this only while `astro dev` is NOT running, so the next dev
// server start builds a fresh image manifest with no stale references.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GROUPS_DIR = path.join(ROOT, 'src/content/groups');

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'heic', 'heif']);

function listGroupSlugs() {
  if (!fs.existsSync(GROUPS_DIR)) return [];
  return fs
    .readdirSync(GROUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(GROUPS_DIR, slug, 'index.md')));
}

function referencedFilenames(slug) {
  const file = path.join(GROUPS_DIR, slug, 'index.md');
  const { data } = matter(fs.readFileSync(file, 'utf-8'));
  return new Set((data.images ?? []).map((img) => path.basename(img.src)));
}

let removed = 0;
for (const slug of listGroupSlugs()) {
  const referenced = referencedFilenames(slug);
  const dir = path.join(GROUPS_DIR, slug);
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    if (referenced.has(name)) continue;
    fs.rmSync(path.join(dir, name));
    console.log(`removed ${slug}/${name}`);
    removed += 1;
  }
}

console.log(removed > 0 ? `\nPruned ${removed} orphaned image file(s).` : 'No orphaned image files found.');
