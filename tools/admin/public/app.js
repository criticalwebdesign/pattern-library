const state = {
  groups: [],
  selectedSlug: null,
  allTags: [], // [{name, count}]
  currentImages: [], // [{filename, url, alt, caption}] for the selected group, in grid order
};

const groupListEl = document.getElementById('group-list');
const mainEl = document.getElementById('main');
const newGroupBtn = document.getElementById('new-group-btn');
const newGroupForm = document.getElementById('new-group-form');
const cancelNewGroupBtn = document.getElementById('cancel-new-group');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxPrevBtn = document.querySelector('[data-lightbox-prev]');
const lightboxNextBtn = document.querySelector('[data-lightbox-next]');

let currentLightboxFilename = null;

function openLightbox(filename) {
  const index = state.currentImages.findIndex((img) => img.filename === filename);
  if (index === -1) return;
  const item = state.currentImages[index];
  lightboxImg.src = item.url;
  lightboxImg.alt = item.alt || '';
  lightboxCaption.textContent = item.caption || '';
  lightboxCaption.hidden = !item.caption;
  currentLightboxFilename = filename;
  lightbox.showModal();
}

function stepLightbox(offset) {
  if (!currentLightboxFilename || !state.currentImages.length) return;
  const index = state.currentImages.findIndex((img) => img.filename === currentLightboxFilename);
  if (index === -1) return;
  const nextIndex = (index + offset + state.currentImages.length) % state.currentImages.length;
  openLightbox(state.currentImages[nextIndex].filename);
}

lightboxPrevBtn.addEventListener('click', () => stepLightbox(-1));
lightboxNextBtn.addEventListener('click', () => stepLightbox(1));

lightbox.addEventListener('click', (event) => {
  if (event.target.closest('[data-lightbox-close]') || event.target === lightbox) {
    lightbox.close();
  }
});

lightbox.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') stepLightbox(1);
  if (event.key === 'ArrowLeft') stepLightbox(-1);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function filenameFromSrc(src) {
  return src.replace(/^\.\//, '');
}

async function refreshTags() {
  state.allTags = await api('/api/tags');
}

async function loadGroups() {
  state.groups = await api('/api/groups');
  renderGroupList();
}

function renderGroupList() {
  groupListEl.replaceChildren();
  for (const group of state.groups) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'group-item' + (group.slug === state.selectedSlug ? ' active' : '');
    btn.innerHTML = `<span class="name">${escapeHtml(group.title)}</span><span class="count">${group.imageCount}</span>`;
    btn.addEventListener('click', () => selectGroup(group.slug));
    groupListEl.appendChild(btn);
  }
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function selectGroup(slug) {
  state.selectedSlug = slug;
  renderGroupList();
  const group = await api(`/api/groups/${slug}`);
  await refreshTags();
  renderMain(group);
}

function renderMain(group) {
  mainEl.replaceChildren();

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `
    <input class="title-input" value="${escapeHtml(group.title)}" data-field="title" />
    <div class="meta-row">
      <select data-field="category">
        <option value="web">web</option>
        <option value="app">app</option>
        <option value="game">game</option>
        <option value="material">material</option>
      </select>
      <select data-field="platform">
        <option value="">Platform (optional)</option>
        <option value="mobile">mobile</option>
        <option value="console">console</option>
        <option value="desktop">desktop</option>
        <option value="browser">browser</option>
      </select>
    </div>
    <input placeholder="Author (optional)" value="${escapeHtml(group.author ?? "")}" data-field="author" />
    <input placeholder="URL" value="${escapeHtml(group.url ?? "")}" data-field="url" />
    <input placeholder="Trailer video URL (YouTube, Vimeo, or direct link)" value="${escapeHtml(group.trailerUrl ?? "")}" data-field="trailerUrl" />
    <textarea placeholder="Description" rows="2" data-field="description">${escapeHtml(group.description ?? "")}</textarea>
    <button type="button" class="btn btn-danger delete-group">Delete group</button>
  `;
  header.querySelector('[data-field="category"]').value = group.category;
  header.querySelector('[data-field="platform"]').value = group.platform ?? '';

  for (const field of ['title', 'category', 'platform', 'author', 'url', 'trailerUrl', 'description']) {
    const el = header.querySelector(`[data-field="${field}"]`);
    el.addEventListener('change', async () => {
      await api(`/api/groups/${group.slug}`, { method: 'PATCH', body: JSON.stringify({ [field]: el.value }) });
      if (field === 'title') await loadGroups();
    });
  }

  header.querySelector('.delete-group').addEventListener('click', async () => {
    if (!confirm(`Delete "${group.title}" and all its images? This can't be undone.`)) return;
    await api(`/api/groups/${group.slug}`, { method: 'DELETE' });
    state.selectedSlug = null;
    await loadGroups();
    mainEl.innerHTML = '<div class="empty-panel">Select a group, or create a new one, to start adding images.</div>';
  });

  const dropzone = document.createElement('div');
  dropzone.className = 'dropzone';
  dropzone.textContent = 'Drag & drop images here, or click to choose files (HEIC/HEIF/TIFF auto-converted to PNG)';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,.heic,.heif,.tif,.tiff';
  fileInput.multiple = true;
  fileInput.hidden = true;

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => uploadFiles(group.slug, fileInput.files));

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    })
  );
  dropzone.addEventListener('drop', (e) => uploadFiles(group.slug, e.dataTransfer.files));

  state.currentImages = (group.images ?? []).map((image) => toLightboxEntry(group.slug, image));

  const grid = document.createElement('div');
  grid.className = 'image-grid';
  for (const image of group.images ?? []) {
    grid.appendChild(renderImageCard(group.slug, image));
  }

  mainEl.append(header, dropzone, fileInput, grid);

  async function uploadFiles(slug, fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const formData = new FormData();
    for (const file of files) formData.append('images', file);
    const { images } = await api(`/api/groups/${slug}/images`, { method: 'POST', body: formData });
    for (const image of images) {
      state.currentImages.push(toLightboxEntry(slug, image));
      grid.appendChild(renderImageCard(slug, image));
    }
    const groupItem = state.groups.find((g) => g.slug === slug);
    if (groupItem) {
      groupItem.imageCount += images.length;
      renderGroupList();
    }
  }
}

function toLightboxEntry(slug, image) {
  const filename = filenameFromSrc(image.src);
  return {
    filename,
    url: `/content-images/${slug}/${filename}`,
    alt: image.alt || '',
    caption: image.caption || '',
  };
}

function renderImageCard(slug, image) {
  const filename = filenameFromSrc(image.src);
  const card = document.createElement('div');
  card.className = 'image-card';

  const imageUrl = `/content-images/${slug}/${filename}`;
  const imgButton = document.createElement('button');
  imgButton.type = 'button';
  imgButton.className = 'image-card-thumb';
  imgButton.title = 'View larger';
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = image.alt || '';
  imgButton.appendChild(img);
  imgButton.addEventListener('click', () => openLightbox(filename));
  card.appendChild(imgButton);

  const fields = document.createElement('div');
  fields.className = 'card-fields';

  const altInput = document.createElement('input');
  altInput.placeholder = 'Describe what this image shows…';
  altInput.value = image.alt || '';
  if (!image.alt) altInput.classList.add('needs-alt');

  const captionInput = document.createElement('input');
  captionInput.placeholder = 'Caption (optional)';
  captionInput.value = image.caption || '';

  const tagEditor = buildTagEditor(image.tags || [], (tags) => saveImage({ tags }));

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const saveIndicator = document.createElement('span');
  saveIndicator.className = 'save-indicator';
  saveIndicator.textContent = 'Saved';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-image';
  deleteBtn.textContent = 'Delete image';
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this image?')) return;
    await api(`/api/groups/${slug}/images/${filename}`, { method: 'DELETE' });
    card.remove();
    state.currentImages = state.currentImages.filter((img) => img.filename !== filename);
    const groupItem = state.groups.find((g) => g.slug === slug);
    if (groupItem) {
      groupItem.imageCount -= 1;
      renderGroupList();
    }
  });
  footer.append(saveIndicator, deleteBtn);

  fields.append(altInput, captionInput, tagEditor.el, footer);
  card.appendChild(fields);

  let debounceTimer;
  function flashSaved() {
    saveIndicator.classList.add('visible');
    clearTimeout(saveIndicator._t);
    saveIndicator._t = setTimeout(() => saveIndicator.classList.remove('visible'), 1200);
  }

  async function saveImage(patch) {
    const entry = await api(`/api/groups/${slug}/images/${filename}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    flashSaved();
    refreshTags();
    return entry;
  }

  altInput.addEventListener('input', () => {
    altInput.classList.toggle('needs-alt', !altInput.value.trim());
    img.alt = altInput.value;
    const entry = state.currentImages.find((i) => i.filename === filename);
    if (entry) entry.alt = altInput.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => saveImage({ alt: altInput.value }), 500);
  });
  captionInput.addEventListener('input', () => {
    const entry = state.currentImages.find((i) => i.filename === filename);
    if (entry) entry.caption = captionInput.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => saveImage({ caption: captionInput.value }), 500);
  });

  return card;
}

function buildTagEditor(initialTags, onChange) {
  let tags = [...initialTags];
  let matches = [];
  let activeIndex = -1;
  const el = document.createElement('div');
  el.className = 'tag-editor';

  const chips = document.createElement('div');
  chips.className = 'tag-chips';

  const input = document.createElement('input');
  input.placeholder = 'Add tag, press Enter…';

  const suggestions = document.createElement('div');
  suggestions.className = 'tag-suggestions';
  suggestions.hidden = true;

  function renderChips() {
    chips.replaceChildren();
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      const label = document.createElement('span');
      label.textContent = tag;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove tag ${tag}`);
      remove.addEventListener('click', () => {
        tags = tags.filter((t) => t !== tag);
        renderChips();
        onChange(tags);
      });
      chip.append(label, remove);
      chips.appendChild(chip);
    }
  }

  function addTag(raw) {
    const tag = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!tag || tags.includes(tag)) return;
    tags.push(tag);
    renderChips();
    onChange(tags);
    input.value = '';
    hideSuggestions();
  }

  function hideSuggestions() {
    matches = [];
    activeIndex = -1;
    suggestions.hidden = true;
    suggestions.replaceChildren();
  }

  function setActiveIndex(index) {
    activeIndex = index;
    const buttons = suggestions.querySelectorAll('button');
    buttons.forEach((btn, i) => {
      const isActive = i === activeIndex;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.scrollIntoView({ block: 'nearest' });
    });
  }

  function showSuggestions() {
    const query = input.value.trim().toLowerCase();
    activeIndex = -1;
    if (!query) return hideSuggestions();
    matches = state.allTags
      .filter((t) => t.name.includes(query) && !tags.includes(t.name))
      .slice(0, 8);
    if (!matches.length) return hideSuggestions();
    suggestions.replaceChildren();
    matches.forEach((match, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${match.name} (${match.count})`;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        addTag(match.name);
      });
      btn.addEventListener('mouseenter', () => setActiveIndex(i));
      suggestions.appendChild(btn);
    });
    suggestions.hidden = false;
  }

  input.addEventListener('input', showSuggestions);
  input.addEventListener('blur', () => setTimeout(hideSuggestions, 100));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault();
      setActiveIndex(activeIndex < 0 ? 0 : (activeIndex + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault();
      setActiveIndex(activeIndex <= 0 ? matches.length - 1 : activeIndex - 1);
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (activeIndex >= 0 && matches[activeIndex]) {
        addTag(matches[activeIndex].name);
      } else {
        addTag(input.value);
      }
    } else if (e.key === 'Escape' && matches.length) {
      hideSuggestions();
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      renderChips();
      onChange(tags);
    }
  });

  renderChips();
  el.append(chips, input, suggestions);
  return { el };
}

newGroupBtn.addEventListener('click', () => {
  newGroupForm.hidden = false;
  newGroupBtn.hidden = true;
});
cancelNewGroupBtn.addEventListener('click', () => {
  newGroupForm.hidden = true;
  newGroupBtn.hidden = false;
  newGroupForm.reset();
});
newGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(newGroupForm);
  const payload = Object.fromEntries(formData.entries());
  const { slug } = await api('/api/groups', { method: 'POST', body: JSON.stringify(payload) });
  newGroupForm.reset();
  newGroupForm.hidden = true;
  newGroupBtn.hidden = false;
  await loadGroups();
  await selectGroup(slug);
});

loadGroups();
