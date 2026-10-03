import { isSeparator, resetColorAtCaret } from './typing-color.js';

// 觸控裝置專用的鉤針鍵盤：點選圖解表「針法」「總針數」「圈數」欄時從畫面底部彈出，取代手機原生鍵盤。
// 收合後畫面右下角會留一個 ▲ 按鈕，點一下再打開。
// 按鍵只把文字插入游標處，由原本的 input 事件負責存檔與計算，桌面版仍用實體鍵盤。

const STITCHES = [
  ['X', '短針'], ['V', '加針'], ['A', '減針'], ['T', '中長'], ['F', '長針'], ['E', '長長'],
  ['CH', '鎖針'], ['SL', '引拔'], ['W', '3加'], ['M', '3減'], ['DTR', '雙長'], ['QTR', '三長'],
  ['TV', '中加'], ['TA', '中減'], ['FV', '長加'], ['FA', '長減'], ['EV', '長長加'], ['EA', '長長減'],
  ['TW', '中3加'], ['TM', '中3減'], ['FW', '長3加'], ['FM', '長3減'], ['EW', '長長3加'], ['EM', '長長3減'],
  ['TCA', '中棗3'], ['TQ', '中棗4'], ['FCA', '長棗3'], ['PF', '泡芙5長'], ['TG', '中爆5'], ['FG', '長爆5'], ['EG', '長長爆5'],
  ['BLO', '後半針'], ['FLO', '前半針'], ['D', '倒數起'], ['TURN', '反面'], ['DU', '斷線'],
];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SYMBOLS = ['(', ')', '[', ']', '{', '}', ',', '-'];

const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
// 用鉤針鍵盤輸入的欄位：針法欄（針法頁），以及總針數、圈數欄（數字頁）
const isKeyCell = (el) => el instanceof Element && el.matches('[contenteditable][data-field="stitch"], [contenteditable][data-field="total"], [contenteditable][data-field="round"]');
const kindOf = (cell) => (cell.matches('[data-field="stitch"]') ? 'stitch' : 'digit');

// insert：按下去實際輸入的文字（預設就是按鍵上的字）；逗號按一下會輸入「, 」
const key = (text, label, extra = '', insert = text) =>
  `<button type="button" class="ck-key ${extra}" data-ck-insert="${insert}">${text}${label ? `<small>${label}</small>` : ''}</button>`;

let panel = null;
let openBtn = null; // 收合後的 ▲ 按鈕
let lastCell = null; // 最後在輸入的欄位
let collapsedCell = null; // 收合時正在輸入的欄位，點 ▲ 回到這裡
let lastKind = null;
let initialized = false;

function setTab(name) {
  panel.querySelectorAll('.ck-tab').forEach((t) => t.classList.toggle('active', t.dataset.ckTab === name));
  panel.querySelectorAll('[data-ck-page]').forEach((p) => {
    p.hidden = p.dataset.ckPage !== name;
  });
}

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
    <div class="ck-head">
      <button type="button" class="ck-tab active" data-ck-tab="stitch">針法</button>
      <button type="button" class="ck-tab" data-ck-tab="digit">數字</button>
      <button type="button" class="ck-close" data-ck-close>收合 &#9660;</button>
    </div>
    <div class="ck-body" data-ck-page="stitch">${STITCHES.map(([c, l]) => key(c, l)).join('')}</div>
    <div class="ck-body" data-ck-page="digit" hidden>${DIGITS.map((d) => key(d, '')).join('')}</div>
    <div class="ck-foot">
      ${SYMBOLS.map((s) => key(s, '', 'ck-symbol', s === ',' ? ', ' : s)).join('')}
      <button type="button" class="ck-key ck-symbol" data-ck-delete>&#9003;</button>
    </div>
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
      document.execCommand('insertText', false, btn.dataset.ckInsert);
      // TURN 是「翻面並換下一圈」：文字插入後通知編輯器（圖解文本）接著新增下一圈；沒有編輯器接手時就只是文字
      if (btn.dataset.ckInsert === 'TURN') document.activeElement?.dispatchEvent(new CustomEvent('ck-turn', { bubbles: true }));
    } else if (btn.hasAttribute('data-ck-delete')) {
      document.execCommand('delete');
    } else if (btn.dataset.ckTab) {
      setTab(btn.dataset.ckTab);
    } else if (btn.hasAttribute('data-ck-close')) {
      collapse();
    }
  });
  panel.addEventListener('mousedown', (e) => e.preventDefault());
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
  // 換了欄位種類（針法 ↔ 數字）或剛打開時，切到對應的頁；同一種欄位之間移動不打斷你手動切的頁
  const kind = kindOf(cell);
  if (panel.hidden || kind !== lastKind) setTab(kind);
  lastKind = kind;
  lastCell = cell;
  panel.hidden = false;
  syncOpenButton();
  document.body.classList.add('ck-open');
  setTimeout(() => cell.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
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
