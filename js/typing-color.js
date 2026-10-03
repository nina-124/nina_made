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

// 電腦實體鍵盤：在逗號輸入之前把顏色切回預設色
export function bindSeparatorColor(cell) {
  cell.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && isSeparator(e.data)) resetColorAtCaret(cell);
  });
}
