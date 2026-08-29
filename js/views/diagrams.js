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

export function isEditMode() {
  return editMode;
}

// ---------- 新增分類/圖解 彈窗 ----------
function openNodeModal(onSubmit) {
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
            <option value="pattern" selected>圖解筆記</option>
          </select>
        </label>
        <label class="cover-field">封面照片（選填） <input type="file" name="cover" accept="image/*"></label>
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

  const typeSelect = overlay.querySelector('select[name="type"]');
  const coverField = overlay.querySelector('.cover-field');
  typeSelect.addEventListener('change', () => {
    coverField.style.display = typeSelect.value === 'pattern' ? 'flex' : 'none';
  });

  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name="name"]').value.trim();
    if (!name) return;
    const type = typeSelect.value;
    let coverPending = null;
    if (type === 'pattern') {
      const fileInput = overlay.querySelector('input[name="cover"]');
      const file = fileInput.files[0];
      if (file) coverPending = await resizeImageToDataUrl(file);
    }
    onSubmit({ name, type, coverPending });
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
      ${editMode ? `<div class="card card-add" id="add-card">&#65291;</div>` : ''}
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
      openNodeModal(({ name, type, coverPending }) => {
        const newNode = { id: slugify(name), name, type };
        if (type === 'category') newNode.items = [];
        if (type === 'pattern') {
          newNode.yarnNote = '';
          newNode.tables = [];
          newNode.blocks = [];
          if (coverPending) newNode.coverPending = coverPending;
        }
        node.items = node.items || [];
        node.items.push(newNode);
        renderTree(container, node, path, trail, ctx);
      });
    });
  }

  bindEditToggle(container, ctx, () => renderTree(container, node, path, trail, ctx));

  for (const item of items) {
    if (item.type !== 'pattern') continue;
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
function renderTableSection(table, ctx, onStructureChange) {
  const rowsHtml = table.rows
    .map(
      (row) => `
      <tr data-row="${row.id}">
        <td>${
          editMode
            ? `<input type="text" value="${row.round}" data-field="round">`
            : `<span style="color:${row.color || 'inherit'}">${row.round}</span>`
        }</td>
        <td>${
          editMode
            ? `<input type="text" value="${row.stitch}" data-field="stitch">`
            : `<span style="color:${row.color || 'inherit'}">${row.stitch}</span>`
        }</td>
        <td>${
          editMode
            ? `<input type="text" value="${row.total}" data-field="total">`
            : `<span style="color:${row.color || 'inherit'}">${row.total}</span>`
        }</td>
        ${
          editMode
            ? `<td><input type="color" value="${row.color || '#2c3527'}" data-field="color"></td>
               <td><button class="del-btn" data-del-row style="position:static;">&#10005;</button></td>`
            : ''
        }
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
        <thead><tr><th>圈數</th><th>針法</th><th>總針數</th>${editMode ? '<th>顏色</th><th></th>' : ''}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${editMode ? `<button class="btn btn-secondary" data-add-row style="margin-top:8px;">&#65291; 新增列</button>` : ''}
    </div>
  `;
}

function bindTableSection(container, table, onStructureChange) {
  const el = container.querySelector(`[data-table="${table.id}"]`);
  if (!el) return;

  el.querySelectorAll('tr[data-row] input[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      const rowId = input.closest('tr').dataset.row;
      const row = table.rows.find((r) => r.id === rowId);
      row[input.dataset.field] = input.value;
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
      table.rows.push({ id: newId(), round: '', stitch: '', total: '', color: null });
      onStructureChange();
    });
  }
}

function renderBlockSection(block, ctx) {
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
          ? `<label class="block-height">高度(px) <input type="number" min="60" step="10" value="${block.height || 120}" data-block-height></label>`
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

  container.innerHTML = `
    <div class="topbar">
      ${renderCrumb(trail, ctx)}
      <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${
    editMode ? '&#10003;' : '&#9998;'
  }</button>
    </div>
    <h2 class="work-detail-name">${node.name}</h2>
    <div class="diagram-layout">
      <div class="diagram-left">
        <label style="font-weight:700;">線材需求</label>
        ${
          editMode
            ? `<textarea id="yarn-note" style="width:100%; min-height:80px; border-radius:10px; border:1px solid #c7d8b8; padding:10px; font-family:inherit;">${node.yarnNote || ''}</textarea>`
            : `<p class="block-text">${(node.yarnNote || '（尚未填寫）').replace(/\n/g, '<br>')}</p>`
        }
        ${node.tables.map((t) => renderTableSection(t, ctx)).join('')}
        ${editMode ? `<button class="btn btn-secondary" id="add-table">&#65291; 新增部位表格</button>` : ''}
      </div>
      <div class="diagram-right">
        ${node.blocks.map((b) => renderBlockSection(b, ctx)).join('')}
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
  `;

  bindCrumb(container, ctx);

  const yarnNote = container.querySelector('#yarn-note');
  if (yarnNote) yarnNote.addEventListener('input', () => (node.yarnNote = yarnNote.value));

  const onTableStructureChange = (action) => {
    if (action?.removeTable) {
      node.tables = node.tables.filter((t) => t.id !== action.removeTable);
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
      node.blocks.push({ id: newId(), type: 'image', content: '', height: 200 });
      rerender();
    });
  }
  const addTextBlock = container.querySelector('#add-text-block');
  if (addTextBlock) {
    addTextBlock.addEventListener('click', () => {
      node.blocks.push({ id: newId(), type: 'text', content: '', height: 120 });
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
