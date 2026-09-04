import { PRIVATE_REPO, getJsonFile, putJsonFile } from '../github-api.js';
import { ICONS } from '../icons.js';

const DATA_PATH = 'data/materials.json';

let cache = null;
let sha = null;
let editMode = false;

function emptyData() {
  return { yarnGroups: [], toolGroups: [] };
}

async function loadData(token) {
  if (cache) return cache;
  const result = await getJsonFile(PRIVATE_REPO, DATA_PATH, token);
  cache = result.data || emptyData();
  if (!cache.yarnGroups) cache.yarnGroups = [];
  if (!cache.toolGroups) cache.toolGroups = [];
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

// ---------- modal：新增/編輯分組（線材頁＝品牌，工具頁＝物品） ----------
function openGroupModal(existing, onSubmit, opts = {}) {
  const { addTitle = '新增分組', editTitle = '編輯分組', fieldLabel = '名稱', placeholder = '' } = opts;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>${existing ? editTitle : addTitle}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>${fieldLabel} <input type="text" name="name" placeholder="${placeholder}" value="${existing?.name || ''}"></label>
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

function renderVendorLink(item) {
  if (item.vendorUrl) {
    const label = item.vendorName || item.vendorUrl;
    return `<a href="${item.vendorUrl}" target="_blank" rel="noopener">${label}</a>`;
  }
  return item.vendorName || '';
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

// ---------- modal：新增/編輯線材 ----------
function openYarnModal(existing, allItems, onSubmit) {
  const v = (field) => existing?.[field] || '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box modal-box-wide">
      <div class="modal-header"><span>${existing ? '編輯線材' : '新增線材'}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <div class="modal-row">
          <label>線材 <input type="text" name="yarnType" list="opt-yarnType" placeholder="輸入新的或從清單選擇" value="${v('yarnType')}"></label>
          <label>股數 <input type="text" name="ply" list="opt-ply" placeholder="輸入新的或從清單選擇" value="${v('ply')}"></label>
        </div>
        <label>色號
          <div class="color-code-row">
            <input type="text" name="colorCode" list="opt-colorCode" placeholder="輸入新的或從清單選擇" value="${v('colorCode')}">
            <input type="text" name="colorHex" placeholder="#RRGGBB" value="${v('colorHex')}" class="color-hex-input">
            <input type="color" name="colorHexPicker" value="${/^#[0-9A-Fa-f]{6}$/.test(v('colorHex')) ? v('colorHex') : '#ffffff'}" class="color-hex-picker">
          </div>
        </label>
        <div class="modal-row">
          <label>購買平台 <input type="text" name="platform" list="opt-platform" placeholder="輸入新的或從清單選擇" value="${v('platform')}"></label>
          <label>商家名稱 <input type="text" name="vendorName" placeholder="例如：ARE" value="${v('vendorName')}"></label>
        </div>
        <div class="modal-row">
          <label>商家網址 <input type="url" name="vendorUrl" placeholder="https://..." value="${v('vendorUrl')}"></label>
          <label>數量
            <div style="display:flex; align-items:center; gap:10px;">
              <button type="button" class="btn btn-secondary" data-qty-minus style="padding:6px 12px;">&#8722;</button>
              <input type="number" name="quantity" min="0" value="${existing ? existing.quantity ?? 1 : 1}" style="width:70px; text-align:center; border-radius:10px; border:1px solid var(--card-border); padding:8px;">
              <button type="button" class="btn btn-secondary" data-qty-plus style="padding:6px 12px;">&#43;</button>
            </div>
          </label>
        </div>
        ${renderDatalist('opt-yarnType', collectOptions(allItems, 'yarnType'))}
        ${renderDatalist('opt-ply', collectOptions(allItems, 'ply'))}
        ${renderDatalist('opt-colorCode', collectOptions(allItems, 'colorCode'))}
        ${renderDatalist('opt-platform', collectOptions(allItems, 'platform'))}
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
  bindQtyStepper(overlay);

  const hexInput = overlay.querySelector('[name="colorHex"]');
  const hexPicker = overlay.querySelector('[name="colorHexPicker"]');
  hexInput.addEventListener('input', () => {
    const hex = hexInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) hexPicker.value = hex;
  });
  hexPicker.addEventListener('input', () => {
    hexInput.value = hexPicker.value;
  });

  overlay.querySelector('[data-submit]').addEventListener('click', () => {
    const get = (name) => overlay.querySelector(`[name="${name}"]`).value.trim();
    const yarnType = get('yarnType');
    if (!yarnType) return;
    onSubmit({
      yarnType,
      ply: get('ply'),
      colorCode: get('colorCode'),
      colorHex: get('colorHex'),
      platform: get('platform'),
      vendorName: get('vendorName'),
      vendorUrl: get('vendorUrl'),
      quantity: Number(overlay.querySelector('[name="quantity"]').value) || 0,
    });
    close();
  });
}

// ---------- modal：新增/編輯工具 ----------
function openToolModal(existing, allTools, onSubmit) {
  const v = (field) => existing?.[field] || '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>${existing ? '編輯工具' : '新增工具'}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        <label>名稱 <input type="text" name="name" list="opt-name" placeholder="例如：眼鏡" value="${v('name')}"></label>
        <label>數量
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="btn btn-secondary" data-qty-minus style="padding:6px 12px;">&#8722;</button>
            <input type="number" name="quantity" min="0" value="${existing ? existing.quantity ?? 1 : 1}" style="width:70px; text-align:center; border-radius:10px; border:1px solid var(--card-border); padding:8px;">
            <button type="button" class="btn btn-secondary" data-qty-plus style="padding:6px 12px;">&#43;</button>
          </div>
        </label>
        <label>購買平台 <input type="text" name="platform" list="opt-platform" placeholder="輸入新的或從清單選擇" value="${v('platform')}"></label>
        <label>廠商名稱 <input type="text" name="vendorName" list="opt-vendorName" placeholder="輸入新的或從清單選擇" value="${v('vendorName')}"></label>
        <label>廠商網址 <input type="url" name="vendorUrl" placeholder="https://..." value="${v('vendorUrl')}"></label>
        ${renderDatalist('opt-name', collectOptions(allTools, 'name'))}
        ${renderDatalist('opt-platform', collectOptions(allTools, 'platform'))}
        ${renderDatalist('opt-vendorName', collectOptions(allTools, 'vendorName'))}
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
  bindQtyStepper(overlay);
  overlay.querySelector('[data-submit]').addEventListener('click', () => {
    const get = (name) => overlay.querySelector(`[name="${name}"]`).value.trim();
    const name = get('name');
    if (!name) return;
    onSubmit({
      name,
      quantity: Number(overlay.querySelector('[name="quantity"]').value) || 0,
      platform: get('platform'),
      vendorName: get('vendorName'),
      vendorUrl: get('vendorUrl'),
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
      await commitCache(ctx.token, '更新線材&工具');
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

// ---------- 線材頁 ----------
function renderYarnGroup(group, keyword) {
  const items = group.items.filter((it) =>
    matchesSearch(it, ['yarnType', 'ply', 'colorCode', 'platform', 'vendorName'], keyword)
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
      <div class="material-table material-table-yarn ${editMode ? 'is-editing' : ''}">
        <div class="material-row material-row-head material-row-yarn">
          <div>線材</div><div>股數</div><div>#色號</div><div>購買平台</div><div>商家</div><div>數量</div><div>建立時間</div>${editMode ? '<div></div>' : ''}
        </div>
        ${items
          .map(
            (it) => `
          <div class="material-row material-row-yarn" data-item="${it.id}">
            <div>${it.yarnType || ''}</div>
            <div>${it.ply || ''}</div>
            <div style="display:flex; align-items:center; gap:6px;">
              ${
                /^#[0-9A-Fa-f]{6}$/.test(it.colorHex || '')
                  ? `<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${it.colorHex}; border:1px solid var(--card-border); flex-shrink:0;"></span>`
                  : ''
              }
              <span>${it.colorCode || ''}</span>
            </div>
            <div>${it.platform || ''}</div>
            <div>${renderVendorLink(it)}</div>
            <div>${it.quantity ?? ''}</div>
            <div>${it.createdAt || ''}</div>
            ${
              editMode
                ? `<div class="material-row-actions">
                     <button class="del-btn" data-edit-item="${it.id}" data-group="${group.id}" style="position:static;">${ICONS.pencil}</button>
                     <button class="del-btn" data-del-item="${it.id}" data-group="${group.id}" style="position:static;">&#10005;</button>
                   </div>`
                : ''
            }
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
        <div class="breadcrumb"><span>線材</span></div>
        <div class="search-box">${ICONS.search}<input placeholder="搜尋品牌、線材、色號" id="materials-search" value="${keyword}"></div>
        ${editMode ? `<button class="icon-btn" id="add-group-btn" title="新增品牌">&#65291;</button>` : ''}
        <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${editMode ? ICONS.check : ICONS.pencil}</button>
      </div>
      <div class="material-groups">
        ${cache.yarnGroups.map((g) => renderYarnGroup(g, keyword)).join('')}
      </div>
      ${!cache.yarnGroups.length ? `<div class="empty-hint">還沒有任何品牌，${editMode ? '點右上角「+」新增' : '進入編輯模式即可新增'}</div>` : ''}
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
        openGroupModal(
          null,
          ({ name }) => {
            cache.yarnGroups.push({ id: newId(), name, items: [] });
            draw();
          },
          { addTitle: '新增品牌', fieldLabel: '品牌名稱', placeholder: '例如：蘇蘇姐家' }
        );
      });
    }

    container.querySelectorAll('[data-edit-group]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.yarnGroups.find((g) => g.id === el.dataset.editGroup);
        openGroupModal(
          group,
          ({ name }) => {
            group.name = name;
            draw();
          },
          { editTitle: '編輯品牌', fieldLabel: '品牌名稱', placeholder: '例如：蘇蘇姐家' }
        );
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
        openYarnModal(null, allItems, (fields) => {
          group.items.push({ id: newId(), ...fields, createdAt: today() });
          draw();
        });
      });
    });

    container.querySelectorAll('[data-edit-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.yarnGroups.find((g) => g.id === el.dataset.group);
        const item = group?.items.find((it) => it.id === el.dataset.editItem);
        if (!item) return;
        const allItems = cache.yarnGroups.flatMap((g) => g.items);
        openYarnModal(item, allItems, (fields) => {
          Object.assign(item, fields);
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
function renderToolGroup(group, keyword) {
  const tools = group.items.filter((t) => matchesSearch(t, ['name', 'platform', 'vendorName'], keyword));
  if (keyword && !tools.length) return '';
  return `
    <div class="material-group" data-group="${group.id}">
      <div class="material-group-head">
        <span class="material-group-tag">${group.name}</span>
        ${
          editMode
            ? `<button class="del-btn" data-edit-group="${group.id}" style="position:static;">${ICONS.pencil}</button>
               <button class="del-btn" data-del-group="${group.id}" style="position:static;">&#10005;</button>
               <button class="link-btn" data-add-item="${group.id}">&#65291; 新增工具</button>`
            : ''
        }
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
            <div>${renderVendorLink(t)}</div>
            <div>${t.createdAt || ''}</div>
            ${
              editMode
                ? `<div class="material-row-actions">
                     <button class="del-btn" data-edit-item="${t.id}" data-group="${group.id}" style="position:static;">${ICONS.pencil}</button>
                     <button class="del-btn" data-del-item="${t.id}" data-group="${group.id}" style="position:static;">&#10005;</button>
                   </div>`
                : ''
            }
          </div>`
          )
          .join('')}
        ${!tools.length ? `<div class="empty-hint" style="padding:16px 0;">還沒有工具資料</div>` : ''}
      </div>
    </div>`;
}

async function renderToolsPage(container, ctx) {
  await loadData(ctx.token);
  const rerender = () => renderToolsPage(container, ctx);
  let keyword = '';

  const draw = () => {
    container.innerHTML = `
      <div class="topbar">
        <div class="breadcrumb"><span>工具</span></div>
        <div class="search-box">${ICONS.search}<input placeholder="搜尋名稱、平台、廠商" id="materials-search" value="${keyword}"></div>
        ${editMode ? `<button class="icon-btn" id="add-group-btn" title="新增物品">&#65291;</button>` : ''}
        <button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${editMode ? ICONS.check : ICONS.pencil}</button>
      </div>
      <div class="material-groups">
        ${cache.toolGroups.map((g) => renderToolGroup(g, keyword)).join('')}
      </div>
      ${!cache.toolGroups.length ? `<div class="empty-hint">還沒有任何物品，${editMode ? '點右上角「+」新增' : '進入編輯模式即可新增'}</div>` : ''}
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
        openGroupModal(
          null,
          ({ name }) => {
            cache.toolGroups.push({ id: newId(), name, items: [] });
            draw();
          },
          { addTitle: '新增物品', fieldLabel: '物品名稱', placeholder: '例如：勾針' }
        );
      });
    }

    container.querySelectorAll('[data-edit-group]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.toolGroups.find((g) => g.id === el.dataset.editGroup);
        openGroupModal(
          group,
          ({ name }) => {
            group.name = name;
            draw();
          },
          { editTitle: '編輯物品', fieldLabel: '物品名稱', placeholder: '例如：勾針' }
        );
      });
    });

    container.querySelectorAll('[data-del-group]').forEach((el) => {
      el.addEventListener('click', () => {
        cache.toolGroups = cache.toolGroups.filter((g) => g.id !== el.dataset.delGroup);
        draw();
      });
    });

    container.querySelectorAll('[data-add-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.toolGroups.find((g) => g.id === el.dataset.addItem);
        const allTools = cache.toolGroups.flatMap((g) => g.items);
        openToolModal(null, allTools, (fields) => {
          group.items.push({ id: newId(), ...fields, createdAt: today() });
          draw();
        });
      });
    });

    container.querySelectorAll('[data-edit-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.toolGroups.find((g) => g.id === el.dataset.group);
        const item = group?.items.find((t) => t.id === el.dataset.editItem);
        if (!item) return;
        const allTools = cache.toolGroups.flatMap((g) => g.items);
        openToolModal(item, allTools, (fields) => {
          Object.assign(item, fields);
          draw();
        });
      });
    });

    container.querySelectorAll('[data-del-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const group = cache.toolGroups.find((g) => g.id === el.dataset.group);
        if (group) group.items = group.items.filter((t) => t.id !== el.dataset.delItem);
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
