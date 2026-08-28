import { PUBLIC_REPO, getJsonFile, putJsonFile, uploadImageFile } from '../github-api.js';

const DATA_PATH = 'data/works-public.json';

let cache = null;
let sha = null;
let editMode = false;

async function loadPublicData() {
  if (cache) return cache;
  try {
    const res = await fetch(`./${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    cache = res.ok ? await res.json() : { items: [] };
  } catch {
    cache = { items: [] };
  }
  if (!cache.items) cache.items = [];
  return cache;
}

async function ensureEditableData(token) {
  const result = await getJsonFile(PUBLIC_REPO, DATA_PATH, token);
  cache = result.data || { items: [] };
  if (!cache.items) cache.items = [];
  sha = result.sha;
  return cache;
}

function findNode(path) {
  let node = { items: cache.items };
  const trail = [];
  for (const id of path) {
    const found = (node.items || []).find((i) => i.id === id);
    if (!found) break;
    trail.push(found);
    node = found;
  }
  return { node, trail };
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

function openAddModal(onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>名稱 <input type="text" name="name" placeholder="請輸入名稱"></label>
        <label>類型
          <select name="type">
            <option value="category">分類</option>
            <option value="work">作品</option>
          </select>
        </label>
        <label class="cover-field" style="display:none">封面照片 <input type="file" name="cover" accept="image/*"></label>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>新增</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const typeSelect = overlay.querySelector('select[name="type"]');
  const coverField = overlay.querySelector('.cover-field');
  typeSelect.addEventListener('change', () => {
    coverField.style.display = typeSelect.value === 'work' ? 'flex' : 'none';
  });

  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name="name"]').value.trim();
    if (!name) return;
    const type = typeSelect.value;
    const fileInput = overlay.querySelector('input[name="cover"]');
    const file = fileInput.files[0];
    let coverPending = null;
    if (type === 'work' && file) {
      coverPending = await resizeImageToDataUrl(file);
    }
    onSubmit({ name, type, coverPending });
    close();
  });
}

async function commitPendingImages(token) {
  async function walk(items) {
    for (const item of items || []) {
      if (item.coverPending) {
        const path = `assets/img/works/${item.id}.jpg`;
        const base64 = item.coverPending.split(',')[1];
        await uploadImageFile(PUBLIC_REPO, path, base64, token, `新增作品照片 ${item.name}`);
        item.cover = path;
        delete item.coverPending;
      }
      if (item.items) await walk(item.items);
    }
  }
  await walk(cache.items);
}

function renderCrumb(trail, ctx) {
  const crumbs = [
    `<span class="crumb" data-path="">作品集</span>`,
    ...trail.map(
      (n, i) =>
        `<span class="sep">|</span><span class="crumb" data-path="${trail
          .slice(0, i + 1)
          .map((t) => t.id)
          .join('/')}">${n.name}</span>`
    ),
  ].join('');
  return `<div class="breadcrumb">${crumbs}</div>`;
}

function bindCrumb(container, ctx) {
  container.querySelectorAll('.crumb').forEach((el) => {
    el.addEventListener('click', () => {
      const p = el.dataset.path ? el.dataset.path.split('/') : [];
      ctx.navigate(['works', ...p]);
    });
  });
}

function renderGrid(container, node, path, trail, ctx) {
  const items = node.items || [];
  const cardsHtml = items
    .map(
      (item) => `
      <div class="card" data-id="${item.id}">
        ${editMode ? `<button class="del-btn" data-del="${item.id}">&#10005;</button>` : ''}
        <div class="card-thumb">${
          item.cover || item.coverPending
            ? `<img src="${item.coverPending || item.cover}" alt="${item.name}">`
            : ''
        }</div>
        <div class="card-name">${item.name}</div>
      </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="topbar">
      ${renderCrumb(trail, ctx)}
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
      ${cardsHtml}
      ${editMode ? `<div class="card card-add" id="add-card">&#65291;</div>` : ''}
    </div>
    ${!items.length && !editMode ? `<div class="empty-hint">目前還沒有內容</div>` : ''}
  `;

  bindCrumb(container, ctx);

  container.querySelectorAll('.card[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.del-btn')) return;
      ctx.navigate(['works', ...path, el.dataset.id]);
    });
  });

  container.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      node.items = (node.items || []).filter((i) => i.id !== el.dataset.del);
      renderGrid(container, node, path, trail, ctx);
    });
  });

  const addCard = container.querySelector('#add-card');
  if (addCard) {
    addCard.addEventListener('click', () => {
      openAddModal(({ name, type, coverPending }) => {
        const newNode = { id: slugify(name), name, type };
        if (type === 'category') newNode.items = [];
        if (type === 'work' && coverPending) newNode.coverPending = coverPending;
        node.items = node.items || [];
        node.items.push(newNode);
        renderGrid(container, node, path, trail, ctx);
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
          const refreshed = findNode(path);
          renderGrid(container, refreshed.node, path, refreshed.trail, ctx);
          return;
        }
        await commitPendingImages(ctx.token);
        const res = await putJsonFile(PUBLIC_REPO, DATA_PATH, cache, sha, ctx.token, '更新作品集');
        sha = res.content.sha;
        editMode = false;
        renderGrid(container, node, path, trail, ctx);
      } catch (e) {
        alert(e.message);
        editToggle.disabled = false;
      }
    });
  }
}

function renderWorkPlaceholder(container, node, trail, ctx) {
  container.innerHTML = `
    <div class="topbar">${renderCrumb(trail, ctx)}</div>
    <div class="placeholder-panel">
      「${node.name}」的詳細頁（線材需求、圖解表格、圖文區塊）尚在開發中，之後會接上私有 repo 的資料。
    </div>
  `;
  bindCrumb(container, ctx);
}

export async function renderWorksView(container, path, ctx) {
  await loadPublicData();
  const { node, trail } = findNode(path);

  if (node.type === 'work') {
    if (!ctx.authed) {
      container.innerHTML = `<div class="placeholder-panel">這個內容只有登入才能查看。</div>`;
      return;
    }
    renderWorkPlaceholder(container, node, trail, ctx);
    return;
  }

  renderGrid(container, node, path, trail, ctx);
}
