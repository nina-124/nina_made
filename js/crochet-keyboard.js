// 觸控裝置專用的鉤針鍵盤：點選圖解表「針法」欄時從畫面底部彈出，取代系統鍵盤。
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
const isStitchCell = (el) => el instanceof Element && el.matches('[contenteditable][data-field="stitch"]');

const key = (text, label, extra = '') =>
  `<button type="button" class="ck-key ${extra}" data-ck-insert="${text}">${text}${label ? `<small>${label}</small>` : ''}</button>`;

let panel = null;
let initialized = false;

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
      ${SYMBOLS.map((s) => key(s, '', 'ck-symbol')).join('')}
      <button type="button" class="ck-key ck-symbol" data-ck-delete>&#9003;</button>
    </div>
  `;
  document.body.appendChild(panel);

  // 在 pointerdown 就處理並擋掉預設行為，欄位才不會失去焦點與游標位置
  panel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.ckInsert !== undefined) {
      document.execCommand('insertText', false, btn.dataset.ckInsert);
      // TURN 是「翻面並換下一圈」：文字插入後通知編輯器（圖解文本）接著新增下一圈；沒有編輯器接手時就只是文字
      if (btn.dataset.ckInsert === 'TURN') document.activeElement?.dispatchEvent(new CustomEvent('ck-turn', { bubbles: true }));
    } else if (btn.hasAttribute('data-ck-delete')) {
      document.execCommand('delete');
    } else if (btn.dataset.ckTab) {
      panel.querySelectorAll('.ck-tab').forEach((t) => t.classList.toggle('active', t === btn));
      panel.querySelectorAll('[data-ck-page]').forEach((p) => {
        p.hidden = p.dataset.ckPage !== btn.dataset.ckTab;
      });
    } else if (btn.hasAttribute('data-ck-close')) {
      document.activeElement?.blur();
    }
  });
  panel.addEventListener('mousedown', (e) => e.preventDefault());
}

function show(cell) {
  if (!panel) build();
  cell.setAttribute('inputmode', 'none'); // 不要彈出系統鍵盤
  panel.hidden = false;
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
    if (isTouch() && isStitchCell(e.target)) show(e.target);
  });
  document.addEventListener('focusout', () => {
    // 焦點在針法欄之間移動時不要收合
    setTimeout(() => {
      if (!isStitchCell(document.activeElement)) hide();
    }, 0);
  });
}
