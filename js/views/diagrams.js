import { PRIVATE_REPO, getJsonFile, putJsonFile, uploadImageFile, getRawFileBase64 } from '../github-api.js';

const DATA_PATH = 'data/diagrams.json';

let cache = null;
let sha = null;
let editMode = false;
const imageSrcCache = new Map();

function emptyData() {
  return { items: [] };
}

async function loadData(token) {
  if (cache) return cache;
  const result = await getJsonFile(PRIVATE_REPO, DATA_PATH, token);
  cache = result.data || emptyData();
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

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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

async function resolveImageSrc(path, token) {
  if (!path) return null;
  if (imageSrcCache.has(path)) return imageSrcCache.get(path);
  const base64 = await getRawFileBase64(PRIVATE_REPO, path, token);
  if (!base64) return null;
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  imageSrcCache.set(path, dataUrl);
  return dataUrl;
}

async function commitPendingImages(items, token) {
  for (const item of items || []) {
    if (item.coverPending) {
      const path = `assets/img/${item.id}-cover.jpg`;
      const base64 = item.coverPending.split(',')[1];
      await uploadImageFile(PRIVATE_REPO, path, base64, token, `更新圖解封面 ${item.name}`);
      imageSrcCache.set(path, item.coverPending);
      item.cover = path;
      delete item.coverPending;
    }
    for (const block of item.blocks || []) {
      if (block.type === 'image' && block.content && block.content.startsWith('data:')) {
        const path = `assets/img/${item.id}-block-${block.id}.jpg`;
        const base64 = block.content.split(',')[1];
        await uploadImageFile(PRIVATE_REPO, path, base64, token, `更新圖解圖片 ${item.name}`);
        imageSrcCache.set(path, block.content);
        block.content = path;
      }
    }
    if (item.items) await commitPendingImages(item.items, token);
  }
}

async function commitCache(token, message) {
  const res = await putJsonFile(PRIVATE_REPO, DATA_PATH, cache, sha, token, message);
  sha = res.content.sha;
}

function notifyEditModeChanged() {
  window.dispatchEvent(new CustomEvent('diagrams:editmode-changed'));
}

function notifyUpdated() {
  window.dispatchEvent(new CustomEvent('diagrams:updated'));
}

export function isEditMode() {
  return editMode;
}

// ---------- 給側邊欄（main.js）用來管理「目前這一層」的分類 ----------
export async function getCategoriesAt(path, token) {
  await loadData(token);
  let { node } = findNode(path);
  if (node.type === 'pattern') {
    node = findNode(path.slice(0, -1)).node;
  }
  return (node.items || []).filter((i) => i.type === 'category');
}

export function addCategoryAt(path, { name, coverPending }) {
  let { node } = findNode(path);
  if (node.type === 'pattern') {
    node = findNode(path.slice(0, -1)).node;
  }
  node.items = node.items || [];
  const newNode = { id: slugify(name), name, type: 'category', items: [] };
  if (coverPending) newNode.coverPending = coverPending;
  node.items.push(newNode);
  notifyUpdated();
}

export function deleteCategoryAt(path, id) {
  let { node } = findNode(path);
  if (node.type === 'pattern') {
    node = findNode(path.slice(0, -1)).node;
  }
  node.items = (node.items || []).filter((i) => i.id !== id);
  notifyUpdated();
}

export function openCategoryModal(onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增分類</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>分類名稱 <input type="text" name="name" placeholder="請輸入名稱"></label>
        <label>封面照片（選填） <input type="file" name="cover" accept="image/*"></label>
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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name="name"]').value.trim();
    if (!name) return;
    const file = overlay.querySelector('input[name="cover"]').files[0];
    const coverPending = file ? await resizeImageToDataUrl(file) : null;
    onSubmit({ name, coverPending });
    close();
  });
}

// ---------- 新增圖解筆記 彈窗（主畫面「＋」用，只建圖解筆記，不建分類）----------
function openPatternModal(onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增圖解筆記</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>名稱 <input type="text" name="name" placeholder="請輸入名稱"></label>
        <label>封面照片（選填） <input type="file" name="cover" accept="image/*"></label>
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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name="name"]').value.trim();
    if (!name) return;
    const file = overlay.querySelector('input[name="cover"]').files[0];
    const coverPending = file ? await resizeImageToDataUrl(file) : null;
    onSubmit({ name, coverPending });
    close();
  });
}

// ---------- 巢狀分類樹畫面 ----------
function renderCrumb(trail, ctx) {
  const crumbs = [
    `<span class="crumb" data-path="">圖解</span>`,
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
      ctx.navigate(['diagrams', ...p]);
    });
  });
}

async function renderTree(container, node, path, trail, ctx) {
  const items = node.items || [];

  container.innerHTML = `
    <div class="topbar">
      ${renderCrumb(trail, ctx)}
      <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${
    editMode ? '&#10003;' : '&#9998;'
  }</button>
    </div>
    <div class="card-grid">
      ${items
        .map(
          (item) => `
        <div class="card" data-id="${item.id}">
          ${editMode ? `<button class="del-btn" data-del="${item.id}">&#10005;</button>` : ''}
          <div class="card-thumb" data-thumb="${item.id}">${item.type === 'category' ? '&#128193;' : ''}</div>
          <div class="card-name">${item.name}</div>
        </div>`
        )
        .join('')}
      ${
        editMode
          ? `<div class="card card-add card-add-labeled" id="add-card" title="新增圖解筆記">&#65291; 圖解筆記</div>
             <div class="card card-add card-add-labeled" id="add-category-card" title="新增分類">&#65291; 分類</div>`
          : ''
      }
    </div>
    ${!items.length && !editMode ? `<div class="empty-hint">目前還沒有內容</div>` : ''}
  `;

  bindCrumb(container, ctx);

  container.querySelectorAll('.card[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      ctx.navigate(['diagrams', ...path, el.dataset.id]);
    });
  });

  container.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      node.items = (node.items || []).filter((i) => i.id !== el.dataset.del);
      renderTree(container, node, path, trail, ctx);
    });
  });

  const addCard = container.querySelector('#add-card');
  if (addCard) {
    addCard.addEventListener('click', () => {
      openPatternModal(({ name, coverPending }) => {
        const newNode = { id: slugify(name), name, type: 'pattern', yarnNote: '', tables: [], blocks: [] };
        if (coverPending) newNode.coverPending = coverPending;
        node.items = node.items || [];
        node.items.push(newNode);
        renderTree(container, node, path, trail, ctx);
      });
    });
  }

  const addCategoryCard = container.querySelector('#add-category-card');
  if (addCategoryCard) {
    addCategoryCard.addEventListener('click', () => {
      openCategoryModal(({ name, coverPending }) => {
        const newNode = { id: slugify(name), name, type: 'category', items: [] };
        if (coverPending) newNode.coverPending = coverPending;
        node.items = node.items || [];
        node.items.push(newNode);
        renderTree(container, node, path, trail, ctx);
      });
    });
  }

  bindEditToggle(container, ctx, () => renderTree(container, node, path, trail, ctx));

  for (const item of items) {
    if (!item.cover && !item.coverPending) continue;
    const src = item.coverPending || (await resolveImageSrc(item.cover, ctx.token));
    if (!src) continue;
    const thumb = container.querySelector(`[data-thumb="${item.id}"]`);
    if (thumb) thumb.innerHTML = `<img src="${src}" alt="${item.name}">`;
  }
}

function bindEditToggle(container, ctx, rerender) {
  const editToggle = container.querySelector('#edit-toggle');
  if (!editToggle) return;
  editToggle.addEventListener('click', async () => {
    editToggle.disabled = true;
    try {
      if (!editMode) {
        editMode = true;
        notifyEditModeChanged();
        await rerender();
        return;
      }
      await commitPendingImages(cache.items, ctx.token);
      await commitCache(ctx.token, '更新圖解分類');
      editMode = false;
      notifyEditModeChanged();
      await rerender();
    } catch (e) {
      alert(e.message);
      editToggle.disabled = false;
    }
  });
}

// ---------- 圖解筆記詳細頁（表格 + 圖文區塊）----------
function renderColorPalette() {
  const colors = ['#2c3527', '#c0392b', '#d68910', '#1f6f43', '#1c5d99', '#7d3c98'];
  return `
    <div class="color-palette">
      <span class="palette-label">選取文字上色：</span>
      ${colors
        .map(
          (c) => `<button type="button" class="color-swatch" data-color="${c}" style="background:${c}"></button>`
        )
        .join('')}
      <input type="color" class="color-custom" data-color-custom value="#2c3527" title="自訂顏色">
    </div>
  `;
}

function bindColorPalette(container) {
  const applyColor = (color) => {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
  };
  container.querySelectorAll('.color-swatch').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => applyColor(btn.dataset.color));
  });
  const custom = container.querySelector('[data-color-custom]');
  if (custom) {
    custom.addEventListener('mousedown', (e) => e.preventDefault());
    custom.addEventListener('change', () => applyColor(custom.value));
  }
}

function renderTableSection(table) {
  const rowsHtml = table.rows
    .map(
      (row) => `
      <tr data-row="${row.id}">
        <td>${
          editMode
            ? `<span class="cell-edit" contenteditable="true" data-field="round">${row.round || ''}</span>`
            : `<span>${row.round || ''}</span>`
        }</td>
        <td>${
          editMode
            ? `<span class="cell-edit" contenteditable="true" data-field="stitch">${row.stitch || ''}</span>`
            : `<span>${row.stitch || ''}</span>`
        }</td>
        <td>${
          editMode
            ? `<span class="cell-edit" contenteditable="true" data-field="total">${row.total || ''}</span>`
            : `<span>${row.total || ''}</span>`
        }</td>
        ${editMode ? `<td><button class="del-btn" data-del-row style="position:static;">&#10005;</button></td>` : ''}
      </tr>`
    )
    .join('');

  return `
    <div class="diagram-table" data-table="${table.id}">
      <div class="diagram-table-head">
        ${
          editMode
            ? `<input type="text" class="part-name" value="${table.part}" data-field="part">
               <button class="del-btn" data-del-table style="position:static;">&#10005;</button>`
            : `<h3>${table.part}</h3>`
        }
      </div>
      <table class="diagram-rows">
        <colgroup>
          <col class="col-narrow">
          <col>
          <col class="col-narrow">
          ${editMode ? '<col style="width:32px">' : ''}
        </colgroup>
        <thead><tr><th>圈數</th><th>針法</th><th>總針數</th>${editMode ? '<th></th>' : ''}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${editMode ? `<button class="btn btn-secondary" data-add-row style="margin-top:8px;">&#65291; 新增列</button>` : ''}
    </div>
  `;
}

function bindTableSection(container, table, onStructureChange) {
  const el = container.querySelector(`[data-table="${table.id}"]`);
  if (!el) return;

  el.querySelectorAll('[contenteditable][data-field]').forEach((cell) => {
    cell.addEventListener('input', () => {
      const rowId = cell.closest('tr').dataset.row;
      const row = table.rows.find((r) => r.id === rowId);
      row[cell.dataset.field] = cell.innerHTML;
    });
  });

  el.querySelectorAll('[data-del-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowId = btn.closest('tr').dataset.row;
      table.rows = table.rows.filter((r) => r.id !== rowId);
      onStructureChange();
    });
  });

  const partInput = el.querySelector('input.part-name');
  if (partInput) {
    partInput.addEventListener('input', () => {
      table.part = partInput.value;
    });
  }

  const delTableBtn = el.querySelector('[data-del-table]');
  if (delTableBtn) {
    delTableBtn.addEventListener('click', () => {
      onStructureChange({ removeTable: table.id });
    });
  }

  const addRowBtn = el.querySelector('[data-add-row]');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      table.rows.push({ id: newId(), round: '', stitch: '', total: '' });
      onStructureChange();
    });
  }
}

function renderBlockSection(block, tables) {
  return `
    <div class="diagram-block" data-block="${block.id}" style="min-height:${block.height || 120}px;">
      ${editMode ? `<button class="del-btn" data-del-block>&#10005;</button>` : ''}
      ${
        block.type === 'image'
          ? `<div class="block-image" data-block-thumb="${block.id}"></div>
             ${editMode ? `<input type="file" accept="image/*" data-block-file>` : ''}`
          : editMode
            ? `<textarea data-block-text style="min-height:${block.height || 120}px;">${block.content || ''}</textarea>`
            : `<p class="block-text">${(block.content || '').replace(/\n/g, '<br>')}</p>`
      }
      ${
        editMode
          ? `<div class="block-controls">
              <label class="block-height">高度(px)<input type="number" min="60" step="10" value="${block.height || 120}" data-block-height></label>
              <label class="block-align">對齊
                <select data-block-align>
                  <option value="">不對齊表格</option>
                  ${tables
                    .map(
                      (t) =>
                        `<option value="${t.id}" ${block.alignPart === t.id ? 'selected' : ''}>${t.part}</option>`
                    )
                    .join('')}
                </select>
              </label>
            </div>`
          : ''
      }
    </div>
  `;
}

async function bindBlockSection(container, block, ctx, onStructureChange) {
  const el = container.querySelector(`[data-block="${block.id}"]`);
  if (!el) return;

  const delBtn = el.querySelector('[data-del-block]');
  if (delBtn) delBtn.addEventListener('click', () => onStructureChange({ removeBlock: block.id }));

  const heightInput = el.querySelector('[data-block-height]');
  if (heightInput) {
    heightInput.addEventListener('input', () => {
      block.height = Number(heightInput.value) || 120;
      el.style.minHeight = `${block.height}px`;
    });
  }

  const alignSelect = el.querySelector('[data-block-align]');
  if (alignSelect) {
    alignSelect.addEventListener('change', () => {
      block.alignPart = alignSelect.value || null;
      onStructureChange();
    });
  }

  if (block.type === 'text') {
    const textarea = el.querySelector('[data-block-text]');
    if (textarea) {
      textarea.addEventListener('input', () => {
        block.content = textarea.value;
      });
    }
  } else if (block.type === 'image') {
    const thumb = el.querySelector('[data-block-thumb]');
    const fileInput = el.querySelector('[data-block-file]');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        block.content = await resizeImageToDataUrl(file, 1000);
        if (thumb) thumb.innerHTML = `<img src="${block.content}" alt="">`;
      });
    }
    if (thumb) {
      const src = block.content?.startsWith('data:') ? block.content : await resolveImageSrc(block.content, ctx.token);
      if (src) thumb.innerHTML = `<img src="${src}" alt="">`;
    }
  }
}

async function renderPatternEditor(container, node, trail, ctx) {
  node.tables = node.tables || [];
  node.blocks = node.blocks || [];

  const rerender = () => renderPatternEditor(container, node, trail, ctx);

  const blocksFor = (tableId) => node.blocks.filter((b) => b.alignPart === tableId);
  const unassignedBlocks = node.blocks.filter(
    (b) => !b.alignPart || !node.tables.find((t) => t.id === b.alignPart)
  );

  container.innerHTML = `
    <div class="topbar">
      ${renderCrumb(trail, ctx)}
      <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${
    editMode ? '&#10003;' : '&#9998;'
  }</button>
    </div>
    <div class="diagram-header">
      <h2 class="work-detail-name">${node.name}</h2>
      <div class="diagram-cover">
        <img data-cover-img alt="${node.name}" style="display:none;">
        ${
          editMode
            ? `<label class="diagram-cover-edit">${node.cover || node.coverPending ? '更換照片' : '新增照片'}<input type="file" accept="image/*" data-cover-file></label>`
            : ''
        }
      </div>
    </div>
    <div class="diagram-yarn">
      <label style="font-weight:700;">線材需求</label>
      ${
        editMode
          ? `<textarea id="yarn-note" style="width:100%; min-height:80px; border-radius:10px; border:1px solid #c7d8b8; padding:10px; font-family:inherit;">${node.yarnNote || ''}</textarea>`
          : `<p class="block-text">${(node.yarnNote || '（尚未填寫）').replace(/\n/g, '<br>')}</p>`
      }
    </div>
    ${editMode ? renderColorPalette() : ''}
    <div class="diagram-pairs">
      ${node.tables
        .map(
          (t) => `
        <div class="diagram-pair">
          <div class="diagram-left">${renderTableSection(t)}</div>
          <div class="diagram-right">${blocksFor(t.id)
            .map((b) => renderBlockSection(b, node.tables))
            .join('')}</div>
        </div>`
        )
        .join('')}
      <div class="diagram-pair">
        <div class="diagram-left">
          ${editMode ? `<button class="btn btn-secondary" id="add-table">&#65291; 新增部位表格</button>` : ''}
        </div>
        <div class="diagram-right">
          ${unassignedBlocks.map((b) => renderBlockSection(b, node.tables)).join('')}
          ${
            editMode
              ? `<div class="modal-actions" style="justify-content:flex-start; gap:10px;">
                  <button class="btn btn-secondary" id="add-image-block">&#65291; 新增圖片</button>
                  <button class="btn btn-secondary" id="add-text-block">&#65291; 新增文字</button>
                </div>`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  bindCrumb(container, ctx);
  if (editMode) bindColorPalette(container);

  const yarnNote = container.querySelector('#yarn-note');
  if (yarnNote) yarnNote.addEventListener('input', () => (node.yarnNote = yarnNote.value));

  const coverImg = container.querySelector('[data-cover-img]');
  const coverFile = container.querySelector('[data-cover-file]');
  if (coverFile) {
    coverFile.addEventListener('change', async () => {
      const file = coverFile.files[0];
      if (!file) return;
      node.coverPending = await resizeImageToDataUrl(file, 900);
      if (coverImg) {
        coverImg.src = node.coverPending;
        coverImg.style.display = 'block';
      }
    });
  }
  if (coverImg) {
    const src = node.coverPending || (await resolveImageSrc(node.cover, ctx.token));
    if (src) {
      coverImg.src = src;
      coverImg.style.display = 'block';
    }
  }

  const onTableStructureChange = (action) => {
    if (action?.removeTable) {
      node.tables = node.tables.filter((t) => t.id !== action.removeTable);
      node.blocks.forEach((b) => {
        if (b.alignPart === action.removeTable) b.alignPart = null;
      });
    }
    rerender();
  };
  node.tables.forEach((t) => bindTableSection(container, t, onTableStructureChange));

  const addTableBtn = container.querySelector('#add-table');
  if (addTableBtn) {
    addTableBtn.addEventListener('click', () => {
      node.tables.push({ id: newId(), part: '新部位', rows: [] });
      rerender();
    });
  }

  const onBlockStructureChange = (action) => {
    if (action?.removeBlock) {
      node.blocks = node.blocks.filter((b) => b.id !== action.removeBlock);
    }
    rerender();
  };
  for (const b of node.blocks) {
    await bindBlockSection(container, b, ctx, onBlockStructureChange);
  }

  const addImageBlock = container.querySelector('#add-image-block');
  if (addImageBlock) {
    addImageBlock.addEventListener('click', () => {
      node.blocks.push({ id: newId(), type: 'image', content: '', height: 200, alignPart: null });
      rerender();
    });
  }
  const addTextBlock = container.querySelector('#add-text-block');
  if (addTextBlock) {
    addTextBlock.addEventListener('click', () => {
      node.blocks.push({ id: newId(), type: 'text', content: '', height: 120, alignPart: null });
      rerender();
    });
  }

  const editToggle = container.querySelector('#edit-toggle');
  editToggle.addEventListener('click', async () => {
    editToggle.disabled = true;
    try {
      if (!editMode) {
        editMode = true;
        notifyEditModeChanged();
        await rerender();
        return;
      }
      await commitPendingImages(cache.items, ctx.token);
      await commitCache(ctx.token, `更新圖解「${node.name}」`);
      editMode = false;
      notifyEditModeChanged();
      await rerender();
    } catch (e) {
      alert(e.message);
      editToggle.disabled = false;
    }
  });
}

export async function renderDiagramsView(container, path, ctx) {
  await loadData(ctx.token);
  const { node, trail } = findNode(path);

  if (node.type === 'pattern') {
    await renderPatternEditor(container, node, trail, ctx);
    return;
  }

  await renderTree(container, node, path, trail, ctx);
}
