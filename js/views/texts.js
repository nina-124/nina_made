// 圖解文本：以「列」為單位快速打出針法（P＝部位、R＝圈、換色），可匯出成圖解筆記，也供 3D 預覽頁使用。
// 資料存在私人 repo 的 data/texts.json：{ items: [{ id, name, rows: [...] }] }，列的規則見 text-rows.js。

import { PRIVATE_REPO, getJsonFile, putJsonFile } from '../github-api.js';
import { ICONS } from '../icons.js';
import { countStitches } from '../stitch-count.js';
import { parseStitchHtml, sanitizeStitchHtml, colorIndexOf, withClosingRound } from '../stitch-html.js';
import { applyTextColor, bindSeparatorColor, cellAtCaret, currentTextColor } from '../typing-color.js';
import { swallowNextClick } from '../ghost-click.js';
import { TEXT_COLORS, labelRows, newRow, textRowsToTables, insertInGroup, removeGroup, appendTurn, insertAfterRow } from '../text-rows.js';
import { listPatternDestinations, addPatternToCategory } from './diagrams.js';
import { mountDiagramPreview } from './diagram-preview.js';

const DATA_PATH = 'data/texts.json';

let cache = null;
let sha = null;
let editMode = false;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const newTextId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function loadData(token) {
  if (cache) return cache;
  const result = await getJsonFile(PRIVATE_REPO, DATA_PATH, token);
  cache = result.data || { items: [] };
  if (!cache.items) cache.items = [];
  sha = result.sha;
  return cache;
}

async function commit(token, message) {
  const res = await putJsonFile(PRIVATE_REPO, DATA_PATH, cache, sha, token, message);
  sha = res.content.sha;
}

function bindEditToggle(container, ctx, message, rerender) {
  const btn = container.querySelector('#edit-toggle');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (editMode) {
        await commit(ctx.token, message);
        editMode = false;
      } else {
        editMode = true;
      }
      rerender();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  });
}

const editToggleHtml = () =>
  `<button class="icon-btn ${editMode ? 'confirm' : ''}" id="edit-toggle">${editMode ? ICONS.check : ICONS.pencil}</button>`;

// ---------- 彈窗 ----------
function openModal(title, bodyHtml, submitLabel, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>${title}</span><span class="close-x">&#10005;</span></div>
      <div class="modal-body">
        ${bodyHtml}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-submit>${submitLabel}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-x').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-submit]').addEventListener('click', async () => {
    if ((await onSubmit(overlay)) !== false) close();
  });
  return overlay;
}

function openNameModal(title, initial, onSubmit) {
  openModal(
    title,
    `<label>名稱 <input type="text" name="name" value="${esc(initial)}" placeholder="請輸入名稱"></label>`,
    initial ? '儲存' : '新增',
    (overlay) => {
      const name = overlay.querySelector('input[name="name"]').value.trim();
      if (!name) return false;
      onSubmit(name);
    }
  );
}

async function openExportModal(item, ctx) {
  let destinations;
  try {
    destinations = await listPatternDestinations(ctx.token);
  } catch (e) {
    alert(e.message);
    return;
  }
  if (!destinations.length) {
    alert('圖解裡還沒有第二層以下的分類可以放圖解筆記，請先到「圖解」建立分類。');
    return;
  }
  openModal(
    `匯出「${esc(item.name)}」到圖解`,
    `<label>放進哪個分類
       <select name="dest">${destinations.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
     </label>
     <p style="margin:0; font-size:13px; color:var(--text-grey);">會在這個分類底下新增一份圖解筆記，每個 P 變成一張部位表，顏色變成針法的文字顏色（之後可以在圖解裡改成實際的顏色）。匯出後兩邊各自獨立。</p>`,
    '匯出',
    async (overlay) => {
      const select = overlay.querySelector('select[name="dest"]');
      const destName = select.selectedOptions[0].textContent;
      try {
        await addPatternToCategory(select.value, { name: item.name, tables: textRowsToTables(item.rows) }, ctx.token);
      } catch (e) {
        alert(e.message);
        return false;
      }
      alert(`已匯出到「${destName}」`);
    }
  );
}

// ---------- 列表頁 ----------
function renderList(container, ctx) {
  const items = cache.items;
  const rerender = () => renderList(container, ctx);
  container.innerHTML = `
    <div class="topbar">
      <div class="breadcrumb"><span class="crumb">圖解文本</span></div>
      ${editToggleHtml()}
    </div>
    <div class="card-grid">
      ${items
        .map(
          (item) => `
        <div class="card text-card" data-id="${item.id}">
          <button class="del-btn" data-export="${item.id}" title="匯出到圖解" style="right:${editMode ? 52 : -8}px; color:var(--green-700);">${ICONS.exportIcon}</button>
          ${
            editMode
              ? `<button class="del-btn" data-rename="${item.id}" style="right:22px; color:var(--green-700);">${ICONS.pencil}</button>
                 <button class="del-btn" data-del="${item.id}" style="right:-8px;">&#10005;</button>`
              : ''
          }
          <div class="card-name">${esc(item.name)}</div>
        </div>`
        )
        .join('')}
      ${editMode ? `<div class="card card-add card-add-labeled text-card" id="add-card">&#65291; 圖解文本</div>` : ''}
    </div>
    ${!items.length && !editMode ? `<div class="empty-hint">目前還沒有圖解文本</div>` : ''}
  `;

  container.querySelectorAll('.card[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      ctx.navigate(['texts', el.dataset.id]);
    });
  });
  container.querySelectorAll('[data-export]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExportModal(items.find((i) => i.id === el.dataset.export), ctx);
    });
  });
  container.querySelectorAll('[data-rename]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items.find((i) => i.id === el.dataset.rename);
      openNameModal('修改名稱', item.name, (name) => {
        item.name = name;
        rerender();
      });
    });
  });
  container.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      cache.items = items.filter((i) => i.id !== el.dataset.del);
      rerender();
    });
  });
  const add = container.querySelector('#add-card');
  if (add) {
    add.addEventListener('click', () => {
      openNameModal('新增圖解文本', '', (name) => {
        items.push({ id: newTextId(), name, rows: [newRow('P')] });
        rerender();
      });
    });
  }
  bindEditToggle(container, ctx, '更新圖解文本', rerender);
}

// ---------- 表格（編輯頁與 3D預覽頁共用）----------
// 編輯時 R 列的色點：點一下切換這一圈的顏色（沒指定 → 色1 → 色2 → 色3 → 沒指定）
function roundDotButton(row, colorIndex, explicit) {
  const own = Number.isInteger(row.color) && TEXT_COLORS[row.color] ? row.color : null;
  const fill = explicit ? TEXT_COLORS[colorIndex].hex : 'transparent';
  const title = own === null ? '這一圈換色（點一下切換）' : `這一圈：${TEXT_COLORS[own].name}（點一下切換）`;
  return `<button type="button" class="text-round-dot ${own !== null ? 'is-own' : ''}" data-round-color="${row.id}" title="${title}" style="background:${fill}"></button>`;
}

function tableHtml(text, editable) {
  const labeled = labelRows(text.rows);
  const hasColorChange = text.rows.some((r) => r.kind === 'C' || (r.kind === 'R' && Number.isInteger(r.color)));
  const dot = (i) => `<span class="text-dot" style="background:${TEXT_COLORS[i].hex}"></span>`;
  const cell = (row, field, value) => {
    // 針法欄帶文字顏色；唯讀顯示時自動補上結尾的 SL, CH，編輯時不動使用者打的字
    const shown = field === 'stitch' ? (editable ? sanitizeStitchHtml(value) : withClosingRound(sanitizeStitchHtml(value))) : esc(value);
    // 針法、總針數欄都用鉤針專用鍵盤，不要彈出手機原生鍵盤（inputmode / virtualkeyboardpolicy）
    const noNativeKeyboard = ' inputmode="none" virtualkeyboardpolicy="manual"';
    return editable ? `<span class="cell-edit" contenteditable="true" data-field="${field}"${noNativeKeyboard}>${shown}</span>` : shown;
  };

  const rows = labeled
    .map(({ row, label, colorIndex, explicit }) => {
      const del = editable
        ? `<div><button class="del-btn" ${row.kind === 'P' ? 'data-del-part' : 'data-del-row'}="${row.id}" title="${row.kind === 'P' ? `刪除 ${label} 與它底下的列` : '刪除這一列'}" style="position:static;">&#10005;</button></div>`
        : '';
      if (row.kind === 'P') {
        const partTools = editable
          ? `<div class="text-part-tools">
              <button type="button" class="btn btn-secondary text-mini" data-add-in="${row.id}" data-kind="R">＋R</button>
              ${TEXT_COLORS.map(
                (c, i) =>
                  `<button type="button" class="text-mini-dot" data-add-in="${row.id}" data-kind="C" data-color="${i}" title="${c.name}：游標在針法欄就設定字色（先選顏色再打字），不在針法欄就在 ${label} 底下加入換色列" style="background:${c.hex}"></button>`
              ).join('')}
            </div>`
          : '<div></div>';
        return `<div class="text-row text-row-p" data-row="${row.id}"><div class="text-cell-label">${label}</div>${partTools}<div></div>${del}</div>`;
      }
      if (row.kind === 'C') {
        return `<div class="text-row text-row-c" data-row="${row.id}"><div class="text-cell-label">${dot(colorIndex)}</div><div>換色：${TEXT_COLORS[colorIndex].name}</div><div></div>${del}</div>`;
      }
      return `<div class="text-row" data-row="${row.id}">
        <div class="text-cell-label">${
          editable
            ? roundDotButton(row, colorIndex, explicit)
            : hasColorChange
              ? dot(colorIndex)
              : ''
        }${label}</div>
        <div>${cell(row, 'stitch', row.stitch)}</div>
        <div class="text-cell-total">${cell(row, 'total', row.total)}</div>${del}</div>`;
    })
    .join('');
  return `<div class="text-grid ${editable ? 'is-editing' : ''}">${rows}</div>`;
}

// ---------- 可編輯的表格＋工具鍵（編輯頁與 3D預覽頁共用）----------
// onChange：表格內容有任何變動（打字、加列、刪列）都會呼叫，3D預覽頁用它即時更新預覽
function mountTableEditor(host, text, { compact = false, onChange = () => {} } = {}) {
  let lastStitchCell = null; // 最後編輯的針法欄：按 TURN / DU 時把文字插入這裡
  let lastRowId = null; // 游標最後所在的列：右邊的 R 鍵把新的一圈加在它的正下方
  const render = () => {
    // 手機：工具列用精簡版省版面；觸控裝置有鉤針鍵盤，TURN、DU 在鍵盤上，工具列就不放
    const phone = window.matchMedia('(max-width: 720px), (hover: none) and (pointer: coarse) and (max-width: 1100px)').matches;
    const hasKeyboard = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    host.innerHTML = `
      <div class="text-editor">
        <div class="text-table-wrap">${tableHtml(text, editMode)}</div>
        ${
          editMode
            ? compact || phone
              ? `<div class="text-tools text-tools-compact">
                  <button class="btn btn-secondary text-tool" data-add="P" title="新增 P（自動序號）">P</button>
                  <button class="btn btn-secondary text-tool" data-add="R" title="新增 R（自動序號）">R</button>
                  ${TEXT_COLORS.map(
                    (c, i) =>
                      `<button type="button" class="text-mini-dot text-color-btn" data-add-color="${i}" title="換色：${c.name}" style="background:${c.hex}"></button>`
                  ).join('')}
                  <button type="button" class="text-mini-dot text-color-btn text-color-default" data-default-color title="黑色（預設）：先選顏色再打字"></button>
                  ${
                    hasKeyboard
                      ? ''
                      : `<button class="btn btn-secondary text-tool text-tool-token" data-turn title="TURN：翻面並換下一圈">TURN</button>
                  <button class="btn btn-secondary text-tool text-tool-token" data-insert="DU" title="插入 DU（斷線）">DU</button>`
                  }
                </div>`
              : `<div class="text-tools">
                  <button class="btn btn-secondary text-tool" data-add="P">P:自動序號</button>
                  <button class="btn btn-secondary text-tool" data-add="R">R:自動序號</button>
                  ${TEXT_COLORS.map(
                    (c, i) =>
                      `<button class="btn btn-secondary text-tool" data-add-color="${i}"><span class="text-dot" style="background:${c.hex}"></span>換色 ${c.name}</button>`
                  ).join('')}
                  <button class="btn btn-secondary text-tool" data-default-color><span class="text-dot text-dot-default"></span>黑色（預設）</button>
                  <button class="btn btn-secondary text-tool" data-turn>TURN:翻面換圈</button>
                  <button class="btn btn-secondary text-tool" data-insert="DU">DU:斷線</button>
                </div>`
            : ''
        }
      </div>`;
    bind();
  };

  // 要作用的針法欄：最後編輯的那一欄；沒有的話用最後一個 R 列，游標放在尾端
  const targetStitchCell = () => {
    if (lastStitchCell && host.contains(lastStitchCell)) return lastStitchCell;
    const cells = host.querySelectorAll('[data-field="stitch"]');
    const cell = cells[cells.length - 1];
    if (!cell) return null;
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return cell;
  };

  // 色點：游標（或選取）在針法欄裡 → 選取的字變色，或接下來打的字用這個顏色（hex 為 null 就是黑色／預設）。
  // 回傳 false 表示不在針法欄裡，由呼叫端決定要做什麼
  const applyColor = (hex) => {
    const cell = cellAtCaret('[data-field="stitch"]');
    if (!cell || !host.contains(cell)) return false;
    applyTextColor(cell, hex);
    markCurrentColor();
    return true; // 會觸發 input 事件，原本的存檔與計算照常運作
  };

  // 游標處目前的字色，對應的色點加上外框；游標不在針法欄裡就全部取消
  const markCurrentColor = () => {
    const inCell = cellAtCaret('[data-field="stitch"]');
    const index = inCell && host.contains(inCell) ? colorIndexOf(currentTextColor()) : undefined;
    host.querySelectorAll('[data-add-color]').forEach((el) => el.classList.toggle('is-current', index === Number(el.dataset.addColor)));
    host.querySelectorAll('[data-default-color]').forEach((el) => el.classList.toggle('is-current', index === null));
  };
  const onSelectionChange = () => (host.isConnected ? markCurrentColor() : document.removeEventListener('selectionchange', onSelectionChange));
  document.addEventListener('selectionchange', onSelectionChange);

  // 把標記插入針法欄的游標處（DU）；會觸發 input 事件，原本的存檔與計算照常運作
  const insertToken = (token) => {
    if (targetStitchCell()) document.execCommand('insertText', false, token);
  };

  // TURN：翻面並換下一圈。這一圈結尾補 TURN，並在正下方新增下一個 R 列，游標跳過去
  const turnToNextRound = (cell) => {
    const row = text.rows.find((r) => r.id === cell.closest('[data-row]')?.dataset.row);
    if (!row) return;
    row.stitch = appendTurn(row.stitch);
    const next = newRow('R');
    insertAfterRow(text.rows, row.id, next);
    render();
    onChange();
    host.querySelector(`[data-row="${next.id}"] [data-field="stitch"]`)?.focus();
  };

  host.addEventListener('focusin', (e) => {
    if (e.target.matches?.('[data-field="stitch"]')) lastStitchCell = e.target;
    const rowId = e.target.closest?.('[data-row]')?.dataset.row;
    if (rowId) lastRowId = rowId;
  });
  // 手機鍵盤的 TURN 鍵：文字已經插入，這裡接著換到下一圈
  host.addEventListener('ck-turn', (e) => {
    const cell = e.target.closest?.('[data-field="stitch"]');
    if (cell) turnToNextRound(cell);
  });

  const bind = () => {
    // pointerdown 就處理並擋掉預設行為，欄位才不會失去焦點與游標位置
    host.querySelectorAll('[data-turn]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        swallowNextClick(); // 按下就處理；抬起手指的點擊不要穿透到重畫後出現在原位的別的按鈕
        const cell = targetStitchCell();
        if (cell) turnToNextRound(cell);
      });
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => e.preventDefault());
    });
    host.querySelectorAll('[data-insert]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        swallowNextClick(); // 按下就處理；抬起手指的點擊不要穿透到重畫後出現在原位的別的按鈕
        insertToken(el.dataset.insert);
      });
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => e.preventDefault());
    });
    host.querySelectorAll('[data-row] [contenteditable]').forEach((el) => {
      const row = text.rows.find((r) => r.id === el.closest('[data-row]').dataset.row);
      if (el.dataset.field === 'stitch') bindSeparatorColor(el); // 逗號一律黑色
      el.addEventListener('input', () => {
        row[el.dataset.field] = el.dataset.field === 'stitch' ? sanitizeStitchHtml(el.innerHTML) : el.textContent;
        if (el.dataset.field === 'stitch') {
          // 針法能解析就自動填總針數；解析不了（或清空）就保留手填的數字
          const t = parseStitchHtml(row.stitch).text.trim();
          const total = t ? countStitches(t) : null;
          if (total !== null) {
            row.total = total > 0 ? String(total) : ''; // 只有鎖針的圈（例如 15CH 起針）不算針目，總針數留空
            el.closest('[data-row]').querySelector('[data-field="total"]').textContent = row.total;
          }
        }
        onChange();
      });
      // 欄位是單行純文字：不換行，貼上只留文字
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
      });
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const plain = (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, plain);
      });
    });

    host.querySelectorAll('[data-del-row]').forEach((el) => {
      el.addEventListener('click', () => {
        text.rows = text.rows.filter((r) => r.id !== el.dataset.delRow);
        render();
        onChange();
      });
    });

    const addRow = (row, focusStitch, pId, afterId) => {
      if (afterId) insertAfterRow(text.rows, afterId, row);
      else if (pId) insertInGroup(text.rows, pId, row);
      else text.rows.push(row);
      render();
      onChange();
      if (focusStitch) host.querySelector(`[data-row="${row.id}"] [data-field="stitch"]`)?.focus();
    };
    host.querySelectorAll('[data-add-in]').forEach((el) => {
      if (el.dataset.kind === 'R') {
        el.addEventListener('click', () => addRow(newRow('R'), true, el.dataset.addIn));
        return;
      }
      // P 列的色點也一樣：游標在針法欄 → 字色；不在針法欄 → 在這個 P 底下新增換色標記
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        swallowNextClick(); // 按下就處理；抬起手指的點擊不要穿透到重畫後出現在原位的別的按鈕
        const n = Number(el.dataset.color);
        if (!applyColor(TEXT_COLORS[n].hex)) addRow(newRow('C', n), false, el.dataset.addIn);
      });
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => e.preventDefault());
    });
    host.querySelectorAll('[data-del-part]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.delPart;
        const count = text.rows.length;
        const idx = text.rows.findIndex((r) => r.id === id);
        const next = text.rows.findIndex((r, i) => i > idx && r.kind === 'P');
        const inside = (next === -1 ? count : next) - idx - 1;
        if (inside > 0 && !confirm(`這個部位底下有 ${inside} 列，會一起刪除，確定嗎？`)) return;
        removeGroup(text.rows, id);
        render();
        onChange();
      });
    });
    host.querySelectorAll('[data-add]').forEach((el) => {
      el.addEventListener('click', () => {
        const kind = el.dataset.add;
        // R：游標在哪一列就加在那一列的正下方；沒有游標（或那一列已刪除）才加到最後
        const after = kind === 'R' && text.rows.some((r) => r.id === lastRowId) ? lastRowId : undefined;
        addRow(newRow(kind), kind === 'R', undefined, after);
      });
    });
    // 色點：游標在針法欄 → 選取的字變色／接下來打的字用這個顏色（先選顏色再打字）；不在針法欄 → 新增一列換色標記
    host.querySelectorAll('[data-add-color]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // 不要讓選取消失
        swallowNextClick(); // 按下就處理；抬起手指的點擊不要穿透到重畫後出現在原位的別的按鈕
        const n = Number(el.dataset.addColor);
        if (!applyColor(TEXT_COLORS[n].hex)) addRow(newRow('C', n), false);
      });
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => e.preventDefault());
    });
    // 黑色（預設）：游標在針法欄才有作用
    host.querySelectorAll('[data-default-color]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        swallowNextClick(); // 按下就處理；抬起手指的點擊不要穿透到重畫後出現在原位的別的按鈕
        applyColor(null);
      });
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => e.preventDefault());
    });
    // 每一圈自己的色點
    host.querySelectorAll('[data-round-color]').forEach((el) => {
      el.addEventListener('click', () => {
        const row = text.rows.find((r) => r.id === el.dataset.roundColor);
        const next = Number.isInteger(row.color) ? row.color + 1 : 0;
        if (next >= TEXT_COLORS.length) delete row.color;
        else row.color = next;
        render();
        onChange();
      });
    });
  };

  render();
}

// ---------- 編輯頁 ----------
function renderEditor(container, text, ctx) {
  container.innerHTML = `
    <div class="topbar">
      <div class="breadcrumb"><span class="crumb" data-back>圖解文本</span></div>
      ${editToggleHtml()}
    </div>
    <h2 class="text-title">${esc(text.name)}</h2>
    <div id="text-editor-host"></div>
  `;
  container.querySelector('[data-back]').addEventListener('click', () => ctx.navigate(['texts']));
  mountTableEditor(container.querySelector('#text-editor-host'), text);
  bindEditToggle(container, ctx, `更新圖解文本「${text.name}」`, () => renderEditor(container, text, ctx));
}

export async function renderTextsView(container, path, ctx) {
  await loadData(ctx.token);
  const text = path[0] && cache.items.find((i) => i.id === path[0]);
  if (text) renderEditor(container, text, ctx);
  else renderList(container, ctx);
}

// ---------- 3D預覽頁：左邊預覽、右邊圖解文本、上方切換文本 ----------
// 右邊可直接修改，預覽即時跟著變；按 ✓ 存檔後，圖解文本（同一份資料）也就同步更新
export async function renderViewerView(container, path, ctx) {
  await loadData(ctx.token);
  const items = cache.items;
  const text = items.find((i) => i.id === path[0]) || items[0];
  if (!text) {
    container.innerHTML = `
      <div class="topbar"><div class="breadcrumb"><span class="crumb">3D預覽</span></div></div>
      <div class="empty-hint">還沒有圖解文本，請先到「圖解文本」新增</div>`;
    return;
  }
  container.innerHTML = `
    <div class="topbar">
      <div class="breadcrumb"><span class="crumb">3D預覽</span></div>
      <div class="diagram-preview-chips" id="viewer-chips">
        ${items
          .map((i) => `<button type="button" class="diagram-preview-chip ${i.id === text.id ? 'active' : ''}" data-id="${i.id}">${esc(i.name)}</button>`)
          .join('')}
      </div>
      ${editToggleHtml()}
    </div>
    <div class="text-viewer">
      <section class="diagram-preview" id="viewer-preview"></section>
      <div id="viewer-table"></div>
    </div>
  `;
  container.querySelectorAll('#viewer-chips [data-id]').forEach((el) => {
    el.addEventListener('click', () => ctx.navigate(['viewer', el.dataset.id]));
  });
  const previewReady = mountDiagramPreview(container.querySelector('#viewer-preview'), () =>
    textRowsToTables(text.rows, { withColor: true })
  );
  mountTableEditor(container.querySelector('#viewer-table'), text, {
    compact: true,
    onChange: () => previewReady.then((p) => p.refresh()),
  });
  bindEditToggle(container, ctx, `更新圖解文本「${text.name}」`, () => renderViewerView(container, path, ctx));
}
