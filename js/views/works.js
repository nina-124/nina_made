import { PUBLIC_REPO, getJsonFile, putJsonFile, uploadImageFile } from '../github-api.js';

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
  if (!work.coverPending) return;
  const path = `assets/img/works/${work.id}.jpg`;
  const base64 = work.coverPending.split(',')[1];
  await uploadImageFile(PUBLIC_REPO, path, base64, token, `更新作品照片 ${work.name}`);
  localPreviewCache.set(work.id, work.coverPending);
  work.cover = path;
  delete work.coverPending;
}

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
    onSubmit({ name, categoryIds, coverPending, removeCover });
    close();
  });
}

function renderCard(work, ctx) {
  const src = work.coverPending || localPreviewCache.get(work.id) || work.cover;
  return `
    <div class="card" data-id="${work.id}">
      ${
        editMode
          ? `<button class="del-btn" data-del="${work.id}" style="right:-8px;">&#10005;</button>
             <button class="del-btn" data-edit="${work.id}" style="right:22px; color:var(--green-700);">&#9998;</button>`
          : ''
      }
      <div class="card-thumb">${src ? `<img src="${src}" alt="${work.name}">` : ''}</div>
      <div class="card-name">${work.name}</div>
    </div>`;
}

function renderGallery(container, data, filterCategoryId, ctx) {
  const category = filterCategoryId ? data.categories.find((c) => c.id === filterCategoryId) : null;
  const works = filterCategoryId
    ? data.works.filter((w) => (w.categoryIds || []).includes(filterCategoryId))
    : data.works;

  container.innerHTML = `
    <div class="topbar">
      <div class="breadcrumb"><span>作品集${category ? ` | ${category.name}` : ''}</span></div>
      <div class="search-box">&#128269;<input placeholder="搜尋"></div>
      ${
        ctx.authed
          ? `<button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${
              editMode ? '&#10003;' : '&#9998;'
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
      ctx.navigate(['works', 'item', el.dataset.id]);
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
        ({ name, categoryIds, coverPending, removeCover }) => {
          work.name = name;
          work.categoryIds = categoryIds;
          if (removeCover) {
            work.cover = null;
            delete work.coverPending;
            localPreviewCache.delete(work.id);
          }
          if (coverPending) work.coverPending = coverPending;
          renderGallery(container, cache, filterCategoryId, ctx);
        }
      );
    });
  });

  const addCard = container.querySelector('#add-card');
  if (addCard) {
    addCard.addEventListener('click', () => {
      openWorkModal({ categories: cache.categories, existing: null }, ({ name, categoryIds, coverPending }) => {
        const work = { id: slugify(name), name, categoryIds };
        if (coverPending) work.coverPending = coverPending;
        cache.works.push(work);
        renderGallery(container, cache, filterCategoryId, ctx);
      });
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

function renderWorkDetail(container, work, ctx) {
  const src = localPreviewCache.get(work.id) || work.cover;
  container.innerHTML = `
    <div class="topbar"><div class="breadcrumb"><span class="crumb" data-back>作品集</span> <span class="sep">|</span> ${work.name}</div></div>
    <div class="work-detail-cover">${src ? `<img src="${src}" alt="${work.name}">` : ''}</div>
    <h2 class="work-detail-name">${work.name}</h2>
    <div class="placeholder-panel">
      ${
        ctx.authed
          ? `線材需求、圖解表格、圖文區塊這類創作筆記，改到「圖解」功能裡獨立管理。`
          : `詳細的線材需求與圖解筆記僅創作者本人可見（在「圖解」功能裡）。`
      }
    </div>
  `;
  container.querySelector('[data-back]').addEventListener('click', () => ctx.navigate(['works']));
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

  if (path[0] === 'item') {
    const work = data.works.find((w) => w.id === path[1]);
    if (!work) {
      container.innerHTML = `<div class="empty-hint">找不到這個作品</div>`;
      return;
    }
    renderWorkDetail(container, work, ctx);
    return;
  }

  const filterCategoryId = path[0] === 'cat' ? path[1] : null;
  renderGallery(container, data, filterCategoryId, ctx);
}
