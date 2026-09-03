import { PRIVATE_REPO, getJsonFile, putJsonFile } from '../github-api.js';
import { ICONS } from '../icons.js';

const DATA_PATH = 'data/materials.json';

let cache = null;
let sha = null;
let editMode = false;

function emptyData() {
  return { yarnGroups: [], tools: [] };
}

async function loadData(token) {
  if (cache) return cache;
  const result = await getJsonFile(PRIVATE_REPO, DATA_PATH, token);
  cache = result.data || emptyData();
  if (!cache.yarnGroups) cache.yarnGroups = [];
  if (!cache.tools) cache.tools = [];
  sha = result.sha;
  return cache;
}

async function commitCache(token, message) {
  const res = await putJsonFile(PRIVATE_REPO, DATA_PATH, cache, sha, token, message);
  sha = res.content.sha;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function notifyUpdated() {
  window.dispatchEvent(new CustomEvent('materials:updated'));
}
function notifyEditModeChanged() {
  window.dispatchEvent(new CustomEvent('materials:editmode-changed'));
}
export function isEditMode() {
  return editMode;
}

function collectOptions(list, field) {
  return Array.from(new Set(list.map((i) => i[field]).filter(Boolean)));
}

function renderDatalist(id, options) {
  return `<datalist id="${id}">${options.map((o) => `<option value="${o.replace(/"/g, '&quot;')}">`).join('')}</datalist>`;
}

function matchesSearch(item, fields, keyword) {
  if (!keyword) return true;
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  return fields.some((f) => String(item[f] || '').toLowerCase().includes(kw));
}

// ---------- modal：新增/編輯來源分組 ----------
function openGroupModal(existing, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>${existing ? '編輯來源' : '新增來源'}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>來源名稱 <input type="text" name="name" placeholder="例如：蘇蘇姐家" value="${existing?.name || ''}"></label>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>${existing ? '儲存' : '新增'}</button>
        </div>
      </div>
    </div>`;
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
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function bindQtyStepper(overlay) {
  const qtyInput = overlay.querySelector('input[name="quantity"]');
  overlay.querySelector('[data-qty-minus]').addEventListener('click', () => {
    qtyInput.value = Math.max(0, Number(qtyInput.value || 0) - 1);
  });
  overlay.querySelector('[data-qty-plus]').addEventListener('click', () => {
    qtyInput.value = Number(qtyInput.value || 0) + 1;
  });
}

// ---------- modal：新增線材 ----------
function openYarnModal(allItems, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增線材</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>品牌 <input type="text" name="brand" list="opt-brand" placeholder="輸入新的或從清單選擇"></label>
        <label>線材 <input type="text" name="yarnType" list="opt-yarnType" placeholder="輸入新的或從清單選擇"></label>
        <label>股數 <input type="text" name="ply" list="opt-ply" placeholder="輸入新的或從清單選擇"></label>
        <label>色號 <input type="text" name="colorCode" list="opt-colorCode" placeholder="輸入新的或從清單選擇"></label>
        <label>數量
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="btn btn-secondary" data-qty-minus style="padding:6px 12px;">&#8722;</button>
            <input type="number" name="quantity" min="0" value="1" style="width:70px; text-align:center; border-radius:10px; border:1px solid var(--card-border); padding:8px;">
            <button type="button" class="btn btn-secondary" data-qty-plus style="padding:6px 12px;">&#43;</button>
          </div>
        </label>
        ${renderDatalist('opt-brand', collectOptions(allItems, 'brand'))}
        ${renderDatalist('opt-yarnType', collectOptions(allItems, 'yarnType'))}
        ${renderDatalist('opt-ply', collectOptions(allItems, 'ply'))}
        ${renderDatalist('opt-colorCode', collectOptions(allItems, 'colorCode'))}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>新增</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  bindQtyStepper(overlay);
  overlay.querySelector('[data-submit]').addEventListener('click', () => {
    const get = (name) => overlay.querySelector(`[name="${name}"]`).value.trim();
    const brand = get('brand');
    const yarnType = get('yarnType');
    if (!brand && !yarnType) return;
    onSubmit({
      brand,
      yarnType,
      ply: get('ply'),
      colorCode: get('colorCode'),
      quantity: Number(overlay.querySelector('[name="quantity"]').value) || 0,
    });
    close();
  });
}

// ---------- modal：新增工具 ----------
function openToolModal(allTools, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增工具</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>名稱 <input type="text" name="name" list="opt-name" placeholder="例如：眼鏡"></label>
        <label>數量
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="btn btn-secondary" data-qty-minus style="padding:6px 12px;">&#8722;</button>
            <input type="number" name="quantity" min="0" value="1" style="width:70px; text-align:center; border-radius:10px; border:1px solid var(--card-border); padding:8px;">
            <button type="button" class="btn btn-secondary" data-qty-plus style="padding:6px 12px;">&#43;</button>
          </div>
        </label>
        <label>購買平台 <input type="text" name="platform" list="opt-platform" placeholder="輸入新的或從清單選擇"></label>
        <label>廠商 <input type="text" name="vendor" list="opt-vendor" placeholder="輸入新的或從清單選擇"></label>
        ${renderDatalist('opt-name', collectOptions(allTools, 'name'))}
        ${renderDatalist('opt-platform', collectOptions(allTools, 'platform'))}
        ${renderDatalist('opt-vendor', collectOptions(allTools, 'vendor'))}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>新增</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  bindQtyStepper(overlay);
  overlay.querySelector('[data-submit]').addEventListener('click', () => {
    const get = (name) => overlay.querySelector(`[name="${name}"]`).value.trim();
    const name = get('name');
    if (!name) return;
    onSubmit({
      name,
      quantity: Number(overlay.querySelector('[name="quantity"]').value) || 0,
      platform: get('platform'),
      vendor: get('vendor'),
    });
    close();
  });
}

async function toggleEdit(container, ctx, rerender) {
  const editToggle = container.querySelector('#edit-toggle');
  if (!editToggle) return;
  editToggle.addEventListener('click', async () => {
    editToggle.disabled = true;
    try {
      if (!editMode) {
        await loadData(ctx.token);
        editMode = true;
        notifyEditModeChanged();
        rerender();
        return;
      }
      await commitCache(ctx.token, '更新綫材&工具');
      editMode = false;
      notifyEditModeChanged();
      notifyUpdated();
      rerender();
    } catch (e) {
      alert(e.message);
      editToggle.disabled = false;
    }
  });
}

// ---------- 綫材頁 ----------
function renderYarnGroup(group, keyword) {
  const items = group.items.filter((it) =>
    matchesSearch(it, ['brand', 'yarnType', 'ply', 'colorCode'], keyword)
  );
  if (keyword && !items.length) return '';
  return `
    <div class="material-group" data-group="${group.id}">
      <div class="material-group-head">
        <span class="material-group-tag">${group.name}</span>
        ${
          editMode
            ? `<button class="del-btn" data-edit-group="${group.id}" style="position:static;">${ICONS.pencil}</button>
               <button class="del-btn" data-del-group="${group.id}" style="position:static;">&#10005;</button>
               <button class="link-btn" data-add-item="${group.id}">&#65291; 新增線材</button>`
            : ''
        }
      </div>
      <div class="material-table ${editMode ? 'is-editing' : ''}">
        <div class="material-row material-row-head">
          <div>綫材種類</div><div>股數</div><div>#色號</div><div>數量</div><div>建立時間</div>${editMode ? '<div></div>' : ''}
        </div>
        ${items
          .map(
            (it) => `
          <div class="material-row" data-item="${it.id}">
            <div>${it.brand ? `${it.brand} ` : ''}${it.yarnType || ''}</div>
            <div>${it.ply || ''}</div>
            <div>${it.colorCode || ''}</div>
            <div>${it.quantity ?? ''}</div>
            <div>${it.createdAt || ''}</div>
            ${editMode ? `<div><button class="del-btn" data-del-item="${it.id}" data-group="${group.id}" style="position:static;">&#10005;</button></div>` : ''}
          </div>`
          )
          .join('')}
        ${!items.length ? `<div class="empty-hint" style="padding:16px 0;">還沒有線材資料</div>` : ''}
      </div>
    </div>`;
}

async function renderYarnPage(container, ctx) {
  await loadData(ctx.token);
  const rerender = () => renderYarnPage(container, ctx);
  let keyword = '';

  const draw = () => {
    container.innerHTML = `
      <div class="topbar">
        <div class="breadcrumb"><span>綫材</span></div>
        <div class="search-box">${ICONS.search}<input placeholder="搜尋品牌、線材、色號" id="materials-search" value="${keyword}"></div>
        ${editMode ? `<button class="icon-btn" id="add-group-btn" title="新增來源">&#65291;</button>` : ''}
        <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${editMode ? ICONS.check : ICONS.pencil}</button>
      </div>
      <div class="material-groups">
        ${cache.yarnGroups.map((g) => renderYarnGroup(g, keyword)).join('')}
      </div>
      ${!cache.yarnGroups.length ? `<div class="empty-hint">還沒有任何來源分組，${editMode ? '點右上角「+」新增' : '進入編輯模式即可新增'}</div>` : ''}
    `;

    const searchInput = container.querySelector('#materials-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        keyword = searchInput.value;
        const caret = searchInput.selectionStart;
        draw();
        const el = container.querySelector('#materials-search');
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }

    toggleEdit(container, ctx, rerender);

    const addGroupBtn = container.querySelector('#add-group-btn');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', () => {
        openGroupModal(null, ({ name }) => {
          cache.yarnGroups.push({ id: newId(), name, items: [] });
          draw();
        });
      });
    }

    container.querySelectorAll('[data-edit-group]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.yarnGroups.find((g) => g.id === el.dataset.editGroup);
        openGroupModal(group, ({ name }) => {
          group.name = name;
          draw();
        });
      });
    });

    container.querySelectorAll('[data-del-group]').forEach((el) => {
      el.addEventListener('click', () => {
        cache.yarnGroups = cache.yarnGroups.filter((g) => g.id !== el.dataset.delGroup);
        draw();
      });
    });

    container.querySelectorAll('[data-add-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.yarnGroups.find((g) => g.id === el.dataset.addItem);
        const allItems = cache.yarnGroups.flatMap((g) => g.items);
        openYarnModal(allItems, (fields) => {
          group.items.push({ id: newId(), ...fields, createdAt: today() });
          draw();
        });
      });
    });

    container.querySelectorAll('[data-del-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.yarnGroups.find((g) => g.id === el.dataset.group);
        if (group) group.items = group.items.filter((it) => it.id !== el.dataset.delItem);
        draw();
      });
    });
  };

  draw();
}

// ---------- 工具頁 ----------
async function renderToolsPage(container, ctx) {
  await loadData(ctx.token);
  const rerender = () => renderToolsPage(container, ctx);
  let keyword = '';

  const draw = () => {
    const tools = cache.tools.filter((t) => matchesSearch(t, ['name', 'platform', 'vendor'], keyword));
    container.innerHTML = `
      <div class="topbar">
        <div class="breadcrumb"><span>工具</span></div>
        <div class="search-box">${ICONS.search}<input placeholder="搜尋名稱、平台、廠商" id="materials-search" value="${keyword}"></div>
        ${editMode ? `<button class="icon-btn" id="add-tool-btn" title="新增工具">&#65291;</button>` : ''}
        <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${editMode ? ICONS.check : ICONS.pencil}</button>
      </div>
      <div class="material-table ${editMode ? 'is-editing' : ''}">
        <div class="material-row material-row-head material-row-tools">
          <div>名稱</div><div>數量</div><div>購買平台</div><div>廠商</div><div>時間</div>${editMode ? '<div></div>' : ''}
        </div>
        ${tools
          .map(
            (t) => `
          <div class="material-row material-row-tools" data-item="${t.id}">
            <div>${t.name}</div>
            <div>${t.quantity ?? ''}</div>
            <div>${t.platform || ''}</div>
            <div>${t.vendor || ''}</div>
            <div>${t.createdAt || ''}</div>
            ${editMode ? `<div><button class="del-btn" data-del-tool="${t.id}" style="position:static;">&#10005;</button></div>` : ''}
          </div>`
          )
          .join('')}
      </div>
      ${!tools.length ? `<div class="empty-hint">還沒有任何工具資料</div>` : ''}
    `;

    const searchInput = container.querySelector('#materials-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        keyword = searchInput.value;
        const caret = searchInput.selectionStart;
        draw();
        const el = container.querySelector('#materials-search');
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }

    toggleEdit(container, ctx, rerender);

    const addToolBtn = container.querySelector('#add-tool-btn');
    if (addToolBtn) {
      addToolBtn.addEventListener('click', () => {
        openToolModal(cache.tools, (fields) => {
          cache.tools.push({ id: newId(), ...fields, createdAt: today() });
          draw();
        });
      });
    }

    container.querySelectorAll('[data-del-tool]').forEach((el) => {
      el.addEventListener('click', () => {
        cache.tools = cache.tools.filter((t) => t.id !== el.dataset.delTool);
        draw();
      });
    });
  };

  draw();
}

export async function renderMaterialsView(container, path, ctx) {
  if (path[0] === 'tools') {
    await renderToolsPage(container, ctx);
  } else {
    await renderYarnPage(container, ctx);
  }
}
