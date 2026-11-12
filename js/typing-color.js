// 文字顏色（圖解文本與圖解筆記共用）：像文字編輯器的字色選擇。
//   有選取文字 → 選取的字變色
//   只有游標   → 接下來輸入的字都是這個顏色（先選顏色，再打字）
// hex 為 null 代表預設色（黑色）：選取的字清掉顏色；只有游標時，接下來的字用欄位原本的文字顏色。

// 目前游標（或選取）所在的欄位；不在 selector 指定的欄位裡就回傳 null
export function cellAtCaret(selector) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  return (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(selector) ?? null;
}

export function applyTextColor(cell, hex) {
  document.execCommand('styleWithCSS', false, true); // 用 <span style="color:…">，和圖解編輯一致
  if (hex !== null) {
    document.execCommand('foreColor', false, hex);
  } else if (window.getSelection().isCollapsed) {
    document.execCommand('foreColor', false, getComputedStyle(cell).color);
  } else {
    document.execCommand('removeFormat');
  }
}

// 游標處目前的字色（rgb(...) 字串）；用來讓畫面上對應的色點亮起
export function currentTextColor() {
  try {
    return document.queryCommandValue('foreColor');
  } catch {
    return '';
  }
}

// 逗號、頓號一律是預設色（黑色）：游標處的字色不是預設色就先切回預設色，之後打的字也是預設色。
// 有選取文字時不處理（打字會直接取代選取的內容）。
export const isSeparator = (text) => /^[,，、]\s*$/.test(text || '');

export function resetColorAtCaret(cell) {
  if (!window.getSelection().isCollapsed) return;
  if (currentTextColor() !== getComputedStyle(cell).color) applyTextColor(cell, null);
}

// 最後一次選的字色（null ＝ 黑色／預設）：沒有再點別的顏色之前，新的一列、逗號後面打的字都沿用它
let stickyHex = null;
export function setStickyColor(hex) {
  stickyHex = hex;
}

export function restoreStickyColor(cell) {
  // 黑色（null）也要明確套用，否則瀏覽器會沿用上一個欄位暫存的輸入顏色
  if (window.getSelection().isCollapsed) applyTextColor(cell, stickyHex);
}

// 針法欄的字色：逗號本身一律是預設色（黑色），逗號之後與新的空白欄位接著用最後選的顏色。電腦與手機鍵盤共用
export function bindSeparatorColor(cell) {
  cell.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && isSeparator(e.data)) resetColorAtCaret(cell);
  });
  cell.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && isSeparator(e.data)) restoreStickyColor(cell);
  });
  // 空白的針法欄取得焦點時（例如新增一列）：接下來打的字用最後選的顏色
  cell.addEventListener('focus', () => {
    setTimeout(() => {
      if (document.activeElement === cell && !cell.textContent.trim()) restoreStickyColor(cell);
    }, 0);
  });
}
