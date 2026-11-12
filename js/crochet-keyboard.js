import { isSeparator, resetColorAtCaret } from './typing-color.js';
import { swallowNextClick } from './ghost-click.js';

// 觸控裝置專用的鉤針鍵盤：點選圖解表「針法」「總針數」「圈數」欄時從畫面底部彈出，取代手機原生鍵盤。
// 所有按鍵一次顯示，沒有分頁也不用捲動。
// 收合鈕 ▼ 是懸浮在鍵盤右上角的小圓鈕；收合後畫面右下角會留一個 ▲ 按鈕，點一下再打開。
// 按鍵只把文字插入游標處，由原本的 input 事件負責存檔與計算，桌面版仍用實體鍵盤。

// 全部按鍵同時顯示（不分頁、不捲動）：沒有備註的針法排成緊湊的列，有備註的另成一組
const PLAIN = ['X', 'V', 'A', 'T', 'F', 'E', 'CH', 'SL', 'K', 'W', 'M', 'TV', 'TA', 'FV', 'FA', 'EV', 'EA', 'TW', 'TM', 'FW', 'FM', 'EW', 'EM'];
const LABELED = [
  ['BLO', '後內針'], ['FLO', '前外針'], ['D', '倒數起'], ['TURN', '反面'], ['DU', '斷線'], ['DTR', '三繞長'], ['QTR', '四繞長'],
  ['TC3', '中棗3'], ['TC4', '中棗4'], ['FC3', '長棗3'], ['TPF5', '泡芙5長'], ['TPC5', '中爆5'], ['FPC5', '長爆5'], ['EPC5', '長長爆5'],
];
// 自動補逗號的針法（LABELED 裡的完整針法；PLAIN 全部都是針法）
const AUTO_COMMA = new Set(['DTR', 'QTR', 'TC3', 'TC4', 'FC3', 'TPF5', 'TPC5', 'FPC5', 'EPC5']);
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SYMBOLS = ['(', ')', '[', ']', '{', '}', '-'];

const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
// 用鉤針鍵盤輸入的欄位：針法欄（針法頁），以及總針數、圈數欄（數字頁）
const isKeyCell = (el) => el instanceof Element && el.matches('[contenteditable][data-field="stitch"], [contenteditable][data-field="total"], [contenteditable][data-field="round"]');

// insert：按下去實際輸入的文字（預設就是按鍵上的字）；逗號按一下會輸入「, 」
// after：完整的針法按完後自動接著輸入「, 」（BLO、D、TURN 這類修飾詞與標記不補）
const key = (text, label, extra = '', insert = text, after = '') =>
  `<button type="button" class="ck-key ${extra}" data-ck-insert="${insert}"${after ? ` data-ck-after="${after}"` : ''}>${text}${label ? `<small>${label}</small>` : ''}</button>`;

let panel = null;
let openBtn = null; // 收合後的 ▲ 按鈕
let lastCell = null; // 最後在輸入的欄位
let collapsedCell = null; // 收合時正在輸入的欄位，點 ▲ 回到這裡
let initialized = false;

// ▲ 只在「已收合、而且輸入的欄位還在畫面上」時顯示
function syncOpenButton() {
  if (!openBtn) return;
  openBtn.hidden = !(collapsedCell && collapsedCell.isConnected && panel.hidden);
}

function collapse() {
  collapsedCell = isKeyCell(document.activeElement) ? document.activeElement : lastCell;
  document.activeElement?.blur();
  hide();
  syncOpenButton();
}

function build() {
  panel = document.createElement('div');
  panel.className = 'ck-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ck-grid ck-plain">${PLAIN.map((c) => key(c, '', '', c, ', ')).join('')}</div>
    <div class="ck-grid ck-labeled">${LABELED.map(([c, l]) => key(c, l, '', c, AUTO_COMMA.has(c) ? ', ' : '')).join('')}</div>
    <div class="ck-grid ck-digits">${DIGITS.map((d) => key(d, '')).join('')}</div>
    <div class="ck-grid ck-foot">
      ${SYMBOLS.map((s) => key(s, '', 'ck-symbol', s === ',' ? ', ' : s)).join('')}
      ${key('空', '', 'ck-symbol', ' ')}
      <button type="button" class="ck-key ck-symbol" data-ck-newline>換行</button>
      <button type="button" class="ck-key ck-symbol ck-delete" data-ck-delete>&#9003;</button>
    </div>
    <button type="button" class="ck-collapse" data-ck-close title="收合">&#9660;</button>
  `;
  document.body.appendChild(panel);

  openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'ck-open-btn';
  openBtn.title = '打開鉤針鍵盤';
  openBtn.innerHTML = '&#9650;';
  openBtn.hidden = true;
  document.body.appendChild(openBtn);
  openBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    swallowNextClick(); // ▲ 按下就消失，抬起手指的點擊不能穿透到後面的東西
    if (collapsedCell?.isConnected) collapsedCell.focus(); // 取得焦點就會自動打開鍵盤
    syncOpenButton();
  });
  openBtn.addEventListener('mousedown', (e) => e.preventDefault());
  openBtn.addEventListener('click', (e) => e.preventDefault());
  // 表格重新繪製時欄位會被換掉，▲ 跟著消失
  new MutationObserver(() => {
    if (!openBtn.hidden) syncOpenButton();
  }).observe(document.body, { childList: true, subtree: true });

  // 在 pointerdown 就處理並擋掉預設行為，欄位才不會失去焦點與游標位置
  panel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.ckInsert !== undefined) {
      // 逗號一律是預設色（黑色），不跟著前面字的顏色
      if (isSeparator(btn.dataset.ckInsert) && isKeyCell(document.activeElement)) resetColorAtCaret(document.activeElement);
      // 前面已經是逗號就不重複輸入（針法鍵已自動補了逗號）
      if (isSeparator(btn.dataset.ckInsert) && endsWithSeparator(document.activeElement)) return;
      document.execCommand('insertText', false, btn.dataset.ckInsert);
      if (btn.dataset.ckAfter && isKeyCell(document.activeElement)) {
        resetColorAtCaret(document.activeElement); // 逗號一律是預設色，不跟著針法的顏色
        document.execCommand('insertText', false, btn.dataset.ckAfter);
      }
      // TURN 是「翻面並換下一圈」：文字插入後通知編輯器（圖解文本）接著新增下一圈；沒有編輯器接手時就只是文字
      if (btn.dataset.ckInsert === 'TURN') document.activeElement?.dispatchEvent(new CustomEvent('ck-turn', { bubbles: true }));
    } else if (btn.hasAttribute('data-ck-newline')) {
      // 換行：在欄位內換行（圖解表的針法欄、圈數欄，例如「14-18」換行再輸入「5」）。圖解文本的針法欄是單行純文字，不支援換行
      const cell = document.activeElement;
      if (isKeyCell(cell) && cell.dataset.field !== 'total' && !cell.closest('.text-editor')) document.execCommand('insertLineBreak');
    } else if (btn.hasAttribute('data-ck-delete')) {
      document.execCommand('delete');
    } else if (btn.hasAttribute('data-ck-close')) {
      swallowNextClick(); // 鍵盤馬上收起來，抬起手指的點擊不能穿透到後面的「登出」
      collapse();
    }
  });
  panel.addEventListener('mousedown', (e) => e.preventDefault());
}

// 游標前面（欄位內）最後一個字是不是逗號（可接空白）
function endsWithSeparator(cell) {
  const sel = window.getSelection();
  if (!isKeyCell(cell) || !sel.rangeCount || !sel.isCollapsed) return false;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  return /[,，、]\s*$/.test(range.toString());
}

function show(cell) {
  if (!panel) build();
  // 不要彈出手機原生鍵盤：欄位產生時就帶著這兩個屬性（見 texts.js、diagrams.js）；
  // 舊的欄位沒有的話補上並重新取得焦點，系統鍵盤才不會已經跳出來
  if (!cell.hasAttribute('inputmode')) {
    cell.setAttribute('inputmode', 'none');
    cell.setAttribute('virtualkeyboardpolicy', 'manual');
    cell.blur();
    cell.focus();
    return;
  }
  lastCell = cell;
  panel.hidden = false;
  syncOpenButton();
  document.body.classList.add('ck-open');
}

function hide() {
  if (!panel) return;
  panel.hidden = true;
  document.body.classList.remove('ck-open');
}

export function initCrochetKeyboard() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('focusin', (e) => {
    if (isTouch() && isKeyCell(e.target)) show(e.target);
  });
  document.addEventListener('focusout', () => {
    // 焦點在這些欄位之間移動時不要收合
    setTimeout(() => {
      if (!isKeyCell(document.activeElement)) {
        hide();
        syncOpenButton();
      }
    }, 0);
  });
}
