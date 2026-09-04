import { PUBLIC_REPO, getJsonFile, putJsonFile, uploadImageFile } from '../github-api.js';
import { ICONS } from '../icons.js';

const DATA_PATH = 'data/works-public.json';

let cache = null;
let sha = null;
let editMode = false;
const localPreviewCache = new Map();

function emptyData() {
  return { categories: [], works: [] };
}

async function loadPublicData() {
  if (cache) return cache;
  try {
    const res = await fetch(`./${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    cache = res.ok ? await res.json() : emptyData();
  } catch {
    cache = emptyData();
  }
  if (!cache.categories) cache.categories = [];
  if (!cache.works) cache.works = [];
  return cache;
}

async function ensureEditableData(token) {
  const result = await getJsonFile(PUBLIC_REPO, DATA_PATH, token);
  cache = result.data || emptyData();
  if (!cache.categories) cache.categories = [];
  if (!cache.works) cache.works = [];
  sha = result.sha;
  return cache;
}

export async function getCategories() {
  const data = await loadPublicData();
  return data.categories;
}

export function isEditMode() {
  return editMode;
}

function notifyUpdated() {
  window.dispatchEvent(new CustomEvent('works:updated'));
}

function notifyEditModeChanged() {
  window.dispatchEvent(new CustomEvent('works:editmode-changed'));
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function slugify(name) {
  const base =
    name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/(^-|-$)/g, '') || 'item';
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

function resizeImageToDataUrl(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function commitCache(token, message) {
  const res = await putJsonFile(PUBLIC_REPO, DATA_PATH, cache, sha, token, message);
  sha = res.content.sha;
}

async function commitPendingWorkImage(work, token) {
  if (work.coverPending) {
    const path = `assets/img/works/${work.id}.jpg`;
    const base64 = work.coverPending.split(',')[1];
    await uploadImageFile(PUBLIC_REPO, path, base64, token, `更新作品照片 ${work.name}`);
    localPreviewCache.set(work.id, work.coverPending);
    work.cover = path;
    delete work.coverPending;
  }
  if (work.photosPending?.length) {
    work.photos = work.photos || [];
    for (const dataUrl of work.photosPending) {
      const path = `assets/img/works/${work.id}-${newId()}.jpg`;
      const base64 = dataUrl.split(',')[1];
      await uploadImageFile(PUBLIC_REPO, path, base64, token, `新增作品照片 ${work.name}`);
      work.photos.push(path);
    }
    delete work.photosPending;
  }
}

export function openCategoryModal(onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增分類</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>分類名稱 <input type="text" name="name" placeholder="例如：寶可夢"></label>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>新增</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const input = overlay.querySelector('input[name="name"]');
  input.focus();
  const submit = () => {
    const name = input.value.trim();
    if (!name) return;
    onSubmit({ name });
    close();
  };
  overlay.querySelector('[data-submit]').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

const MAX_EXTRA_PHOTOS = 4; // 加上封面照片，一件作品最多 5 張

function openWorkModal({ categories, existing }, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const checkboxes = categories
    .map(
      (c) =>
        `<label style="flex-direction:row; align-items:center; gap:8px; font-weight:400;">
          <input type="checkbox" value="${c.id}" ${existing?.categoryIds?.includes(c.id) ? 'checked' : ''}> ${c.name}
        </label>`
    )
    .join('');

  let keptPhotos = [...(existing?.photos || [])];
  let newPhotos = []; // { src: dataUrl } 尚未上傳的新照片

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>${existing ? '編輯作品' : '新增作品'}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>名稱 <input type="text" name="name" placeholder="請輸入名稱" value="${existing?.name || ''}"></label>
        <label>封面照片（${existing ? '不選則維持原圖' : '選填'}） <input type="file" name="cover" accept="image/*"></label>
        ${
          existing?.cover
            ? `<label style="flex-direction:row; align-items:center; gap:8px; font-weight:400;">
                <input type="checkbox" name="removeCover"> 移除目前的照片
               </label>`
            : ''
        }
        <label>更多照片（連封面最多 5 張）
          <div class="extra-photo-strip" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
          <input type="file" name="extraPhoto" accept="image/*" style="margin-top:6px;">
        </label>
        <label>分類（可複選）</label>
        <div style="display:flex; flex-direction:column; gap:6px; max-height:140px; overflow-y:auto;">
          ${checkboxes || '<span style="color:#a7b39c; font-size:13px;">還沒有任何分類，先在左側新增分類</span>'}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>${existing ? '儲存' : '新增'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const extraInput = overlay.querySelector('input[name="extraPhoto"]');
  const strip = overlay.querySelector('.extra-photo-strip');

  const totalExtra = () => keptPhotos.length + newPhotos.length;

  const drawStrip = () => {
    strip.innerHTML = `
      ${keptPhotos
        .map(
          (src, i) => `
        <div style="position:relative; width:56px; height:56px;">
          <img src="${src}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;">
          <button type="button" class="del-btn" data-remove-kept="${i}" style="position:absolute; top:-6px; right:-6px;">&#10005;</button>
        </div>`
        )
        .join('')}
      ${newPhotos
        .map(
          (p, i) => `
        <div style="position:relative; width:56px; height:56px;">
          <img src="${p.src}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;">
          <button type="button" class="del-btn" data-remove-new="${i}" style="position:absolute; top:-6px; right:-6px;">&#10005;</button>
        </div>`
        )
        .join('')}
    `;
    strip.querySelectorAll('[data-remove-kept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        keptPhotos.splice(Number(btn.dataset.removeKept), 1);
        drawStrip();
      });
    });
    strip.querySelectorAll('[data-remove-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        newPhotos.splice(Number(btn.dataset.removeNew), 1);
        drawStrip();
      });
    });
    extraInput.disabled = totalExtra() >= MAX_EXTRA_PHOTOS;
    extraInput.title = extraInput.disabled ? `最多只能再新增 ${MAX_EXTRA_PHOTOS} 張` : '';
  };
  drawStrip();

  extraInput.addEventListener('change', async () => {
    const file = extraInput.files[0];
    extraInput.value = '';
    if (!file || totalExtra() >= MAX_EXTRA_PHOTOS) return;
    const src = await resizeImageToDataUrl(file);
    newPhotos.push({ src });
    drawStrip();
  });

  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name="name"]').value.trim();
    if (!name) return;
    const categoryIds = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked')).map(
      (el) => el.value
    );
    const fileInput = overlay.querySelector('input[name="cover"]');
    const file = fileInput.files[0];
    let coverPending = null;
    if (file) coverPending = await resizeImageToDataUrl(file);
    const removeCover = overlay.querySelector('input[name="removeCover"]')?.checked || false;
    onSubmit({
      name,
      categoryIds,
      coverPending,
      removeCover,
      photos: keptPhotos,
      newPhotos: newPhotos.map((p) => p.src),
    });
    close();
  });
}

function renderCard(work, ctx) {
  const src = work.coverPending || localPreviewCache.get(work.id) || work.cover;
  const tagName = (work.categoryIds || [])
    .map((id) => cache.categories.find((c) => c.id === id)?.name)
    .find(Boolean);
  return `
    <div class="card" data-id="${work.id}">
      ${
        editMode
          ? `<button class="del-btn" data-del="${work.id}" style="right:-8px;">&#10005;</button>
             <button class="del-btn" data-edit="${work.id}" style="right:22px; color:var(--green-700);">${ICONS.pencil}</button>`
          : ''
      }
      <div class="card-thumb">
        ${src ? `<img src="${src}" alt="${work.name}">` : ''}
        ${tagName ? `<span class="card-tag">${tagName}</span>` : ''}
      </div>
      <div class="card-name">${work.name}</div>
    </div>`;
}

function openImageLightbox(work) {
  const coverSrc = work.coverPending || localPreviewCache.get(work.id) || work.cover;
  const photos = [coverSrc, ...(work.photos || [])].filter(Boolean);
  let index = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="width:auto; max-width:90vw; background:#fff;">
      <div class="modal-header"><span>${work.name}</span><span class="close-x">&#10005;</span></div>
      <div style="padding:16px; display:flex; align-items:center; justify-content:center; gap:10px;">
        ${photos.length > 1 ? `<button type="button" class="icon-btn" data-prev>&#8249;</button>` : ''}
        <div class="lightbox-img-wrap">
          ${
            photos.length
              ? `<img src="${photos[0]}" alt="${work.name}" style="max-width:100%; max-height:70vh; border-radius:12px; display:block;">`
              : '<div class="empty-hint">尚未上傳照片</div>'
          }
        </div>
        ${photos.length > 1 ? `<button type="button" class="icon-btn" data-next">&#8250;</button>` : ''}
      </div>
      ${photos.length > 1 ? `<div style="text-align:center; padding-bottom:14px; color:var(--text-grey); font-size:13px;" data-counter>1 / ${photos.length}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const imgWrap = overlay.querySelector('.lightbox-img-wrap');
  const counter = overlay.querySelector('[data-counter]');
  const show = () => {
    imgWrap.innerHTML = `<img src="${photos[index]}" alt="${work.name}" style="max-width:100%; max-height:70vh; border-radius:12px; display:block;">`;
    if (counter) counter.textContent = `${index + 1} / ${photos.length}`;
  };
  overlay.querySelector('[data-prev]')?.addEventListener('click', () => {
    index = (index - 1 + photos.length) % photos.length;
    show();
  });
  overlay.querySelector('[data-next]')?.addEventListener('click', () => {
    index = (index + 1) % photos.length;
    show();
  });
}

function renderGallery(container, data, filterCategoryId, ctx) {
  const category = filterCategoryId ? data.categories.find((c) => c.id === filterCategoryId) : null;
  const works = filterCategoryId
    ? data.works.filter((w) => (w.categoryIds || []).includes(filterCategoryId))
    : data.works;

  container.innerHTML = `
    <div class="topbar">
      <div class="breadcrumb"><span>作品集${category ? ` | ${category.name}` : ''}</span></div>
      <div class="search-box">${ICONS.search}<input placeholder="搜尋"></div>
      ${
        ctx.authed
          ? `<button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${
              editMode ? ICONS.check : ICONS.pencil
            }</button>`
          : ''
      }
    </div>
    <div class="card-grid">
      ${works.map((w) => renderCard(w, ctx)).join('')}
      ${editMode ? `<div class="card card-add" id="add-card">&#65291;</div>` : ''}
    </div>
    ${!works.length && !editMode ? `<div class="empty-hint">目前還沒有作品</div>` : ''}
  `;

  container.querySelectorAll('.card[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (editMode) return;
      if (e.target.closest('[data-del], [data-edit]')) return;
      const work = works.find((w) => w.id === el.dataset.id);
      openImageLightbox(work);
    });
  });

  container.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      cache.works = cache.works.filter((w) => w.id !== el.dataset.del);
      renderGallery(container, cache, filterCategoryId, ctx);
    });
  });

  container.querySelectorAll('[data-edit]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const work = cache.works.find((w) => w.id === el.dataset.edit);
      openWorkModal(
        { categories: cache.categories, existing: work },
        ({ name, categoryIds, coverPending, removeCover, photos, newPhotos }) => {
          work.name = name;
          work.categoryIds = categoryIds;
          if (removeCover) {
            work.cover = null;
            delete work.coverPending;
            localPreviewCache.delete(work.id);
          }
          if (coverPending) work.coverPending = coverPending;
          work.photos = photos;
          if (newPhotos.length) work.photosPending = newPhotos;
          renderGallery(container, cache, filterCategoryId, ctx);
        }
      );
    });
  });

  const addCard = container.querySelector('#add-card');
  if (addCard) {
    addCard.addEventListener('click', () => {
      openWorkModal(
        { categories: cache.categories, existing: null },
        ({ name, categoryIds, coverPending, newPhotos }) => {
          const work = { id: slugify(name), name, categoryIds };
          if (coverPending) work.coverPending = coverPending;
          if (newPhotos.length) work.photosPending = newPhotos;
          cache.works.push(work);
          renderGallery(container, cache, filterCategoryId, ctx);
        }
      );
    });
  }

  const editToggle = container.querySelector('#edit-toggle');
  if (editToggle) {
    editToggle.addEventListener('click', async () => {
      editToggle.disabled = true;
      try {
        if (!editMode) {
          await ensureEditableData(ctx.token);
          editMode = true;
          notifyEditModeChanged();
          renderGallery(container, cache, filterCategoryId, ctx);
          return;
        }
        for (const work of cache.works) {
          await commitPendingWorkImage(work, ctx.token);
        }
        await commitCache(ctx.token, '更新作品集');
        editMode = false;
        notifyEditModeChanged();
        notifyUpdated();
        renderGallery(container, cache, filterCategoryId, ctx);
      } catch (e) {
        alert(e.message);
        editToggle.disabled = false;
      }
    });
  }
}

// --- 給 sidebar（main.js）用來管理分類清單 ---
export function addCategory(name) {
  cache.categories.push({ id: slugify(name), name });
  notifyUpdated();
}

export function deleteCategory(id) {
  cache.categories = cache.categories.filter((c) => c.id !== id);
  cache.works.forEach((w) => {
    w.categoryIds = (w.categoryIds || []).filter((cid) => cid !== id);
  });
  notifyUpdated();
}

export async function renderWorksView(container, path, ctx) {
  const data = await loadPublicData();
  const filterCategoryId = path[0] === 'cat' ? path[1] : null;
  renderGallery(container, data, filterCategoryId, ctx);
}
