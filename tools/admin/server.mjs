import express from 'express';
import multer from 'multer';
import matter from 'gray-matter';
import heicConvert from 'heic-convert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GROUPS_DIR = path.join(ROOT, 'src/content/groups');

const PORT = 4877;

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const HEIC_EXTS = new Set(['heic', 'heif']);

// Browsers (especially Safari/iOS) often send an empty or generic mimetype
// for HEIC/HEIF files, so fall back to the filename extension.
function detectExt(file) {
  const byMime = EXT_BY_MIME[file.mimetype];
  if (byMime) return byMime;
  const byName = path.extname(file.originalname).slice(1).toLowerCase();
  if (byName === 'jpeg') return 'jpg';
  if (Object.values(EXT_BY_MIME).includes(byName)) return byName;
  return null;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/content-images', express.static(GROUPS_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (detectExt(file)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.originalname} (${file.mimetype})`));
  },
});

// ---- helpers ----

function listGroupSlugs() {
  if (!fs.existsSync(GROUPS_DIR)) return [];
  return fs
    .readdirSync(GROUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(GROUPS_DIR, slug, 'index.md')));
}

function readGroup(slug) {
  const file = path.join(GROUPS_DIR, slug, 'index.md');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = matter(raw);
  return parsed.data;
}

function writeGroup(slug, data) {
  const file = path.join(GROUPS_DIR, slug, 'index.md');
  const out = matter.stringify('', data, { skipInvalid: true });
  fs.writeFileSync(file, out, 'utf-8');
}

function slugify(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let slug = base || 'group';
  let n = 2;
  while (fs.existsSync(path.join(GROUPS_DIR, slug))) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function nextImageFilename(slug, ext, offset) {
  const dir = path.join(GROUPS_DIR, slug);
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  let max = 0;
  for (const name of existing) {
    const match = name.match(/^img-(\d+)\./);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const n = max + 1 + offset;
  return `img-${String(n).padStart(2, '0')}.${ext}`;
}

function allTags() {
  const counts = new Map();
  for (const slug of listGroupSlugs()) {
    const data = readGroup(slug);
    for (const image of data?.images ?? []) {
      for (const tag of image.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---- routes ----

app.get('/api/tags', (_req, res) => {
  res.json(allTags());
});

app.get('/api/groups', (_req, res) => {
  const groups = listGroupSlugs().map((slug) => {
    const data = readGroup(slug);
    return {
      slug,
      title: data.title,
      category: data.category,
      platform: data.platform ?? '',
      author: data.author ?? '',
      url: data.url ?? '',
      trailerUrl: data.trailerUrl ?? '',
      description: data.description ?? '',
      imageCount: data.images?.length ?? 0,
    };
  });
  res.json(groups);
});

app.post('/api/groups', (req, res) => {
  const { title, category, platform, author, url, trailerUrl, description } = req.body ?? {};
  if (!title || !category) {
    return res.status(400).json({ error: 'title and category are required' });
  }
  const slug = slugify(title);
  fs.mkdirSync(path.join(GROUPS_DIR, slug), { recursive: true });
  const data = { title, category, images: [] };
  if (platform) data.platform = platform;
  if (author) data.author = author;
  if (url) data.url = url;
  if (trailerUrl) data.trailerUrl = trailerUrl;
  if (description) data.description = description;
  writeGroup(slug, data);
  res.json({ slug });
});

app.get('/api/groups/:slug', (req, res) => {
  const data = readGroup(req.params.slug);
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json({ slug: req.params.slug, ...data });
});

app.patch('/api/groups/:slug', (req, res) => {
  const data = readGroup(req.params.slug);
  if (!data) return res.status(404).json({ error: 'not found' });
  const { title, category, platform, author, url, trailerUrl, description } = req.body ?? {};
  if (title) data.title = title;
  if (category) data.category = category;
  if (platform !== undefined) data.platform = platform || undefined;
  if (author !== undefined) data.author = author || undefined;
  if (url !== undefined) data.url = url || undefined;
  if (trailerUrl !== undefined) data.trailerUrl = trailerUrl || undefined;
  if (description !== undefined) data.description = description || undefined;
  writeGroup(req.params.slug, data);
  res.json({ ok: true });
});

app.delete('/api/groups/:slug', (req, res) => {
  const dir = path.join(GROUPS_DIR, req.params.slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'not found' });
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

app.post('/api/groups/:slug/images', upload.array('images', 25), async (req, res) => {
  const { slug } = req.params;
  const data = readGroup(slug);
  if (!data) return res.status(404).json({ error: 'not found' });

  const files = req.files ?? [];
  const added = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let ext = detectExt(file);
    let buffer = file.buffer;

    if (HEIC_EXTS.has(ext)) {
      try {
        buffer = Buffer.from(await heicConvert({ buffer, format: 'PNG' }));
      } catch (err) {
        return res.status(400).json({ error: `Couldn't convert ${file.originalname}: ${err.message}` });
      }
      ext = 'png';
    }

    const filename = nextImageFilename(slug, ext, added.length);
    fs.writeFileSync(path.join(GROUPS_DIR, slug, filename), buffer);
    const entry = { src: `./${filename}`, alt: '', tags: [] };
    data.images = data.images ?? [];
    data.images.push(entry);
    added.push(entry);
  }

  writeGroup(slug, data);
  res.json({ images: added });
});

app.patch('/api/groups/:slug/images/:filename', (req, res) => {
  const { slug, filename } = req.params;
  const data = readGroup(slug);
  if (!data) return res.status(404).json({ error: 'not found' });

  const entry = (data.images ?? []).find((img) => img.src === `./${filename}`);
  if (!entry) return res.status(404).json({ error: 'image not found in group' });

  const { alt, caption, tags } = req.body ?? {};
  if (alt !== undefined) entry.alt = alt;
  if (caption !== undefined) entry.caption = caption || undefined;
  if (tags !== undefined) entry.tags = tags;

  writeGroup(slug, data);
  res.json({ ok: true, entry });
});

app.delete('/api/groups/:slug/images/:filename', (req, res) => {
  const { slug, filename } = req.params;
  const data = readGroup(slug);
  if (!data) return res.status(404).json({ error: 'not found' });

  data.images = (data.images ?? []).filter((img) => img.src !== `./${filename}`);
  writeGroup(slug, data);

  // Note: the image file itself is intentionally left on disk. Astro's dev
  // server caches image imports in .astro/content-assets.mjs for the life of
  // the process and never prunes entries for deleted files, so removing the
  // file immediately crashes the next page render that touches the stale
  // cached import. Run `npm run admin:prune` (with the dev server stopped)
  // to clean up files that are no longer referenced by any group.

  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n  Pattern Library admin running at http://localhost:${PORT}\n`);
});
