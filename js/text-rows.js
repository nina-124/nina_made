// 圖解文本的列資料與規則（不碰畫面，方便測試）。
// 一份文本是一串列：P＝部位（開一張新表）、R＝圈、C＝換色標記。
// 標記不存檔，每次依順序算出：P 依序 P1、P2…；R 在每個 P 底下重新從 R1 開始。
// 換色只影響它後面的 R，直到下一個換色；遇到新的 P 就回到預設色（第一個顏色）。
// 單獨一圈換色：R 列自己的 color（0～2）優先於前面的換色；單獨幾針換色寫在針法文字裡（COL2 (3X)）。

export const TEXT_COLORS = [
  { name: '粉橘', hex: '#e7b7a3' },
  { name: '綠', hex: '#a9c98f' },
  { name: '黃', hex: '#e9d28a' },
];

let seq = 0;
export function newRowId() {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function newRow(kind, colorIndex = 0) {
  const row = { id: newRowId(), kind };
  if (kind === 'R') Object.assign(row, { stitch: '', total: '' });
  if (kind === 'C') row.color = colorIndex;
  return row;
}

// 回傳每列的 { row, label, colorIndex, explicit }；colorIndex 是該列（R）實際使用的顏色
export function labelRows(rows) {
  let p = 0;
  let r = 0;
  let colorIndex = 0;
  let colorChanged = false; // 這個 P 底下是否出現過換色標記
  return (rows || []).map((row) => {
    if (row.kind === 'P') {
      p += 1;
      r = 0;
      colorIndex = 0;
      colorChanged = false;
      return { row, label: `P${p}`, colorIndex };
    }
    if (row.kind === 'C') {
      colorIndex = TEXT_COLORS[row.color] ? row.color : 0;
      colorChanged = true;
      return { row, label: '換色', colorIndex };
    }
    r += 1;
    const own = Number.isInteger(row.color) && TEXT_COLORS[row.color] ? row.color : null;
    // explicit：使用者真的指定過顏色（單獨換色或之前有換色標記），沒指定的圈不算
    return { row, label: `R${r}`, colorIndex: own ?? colorIndex, explicit: own !== null || colorChanged };
  });
}

// ---- 匯出到圖解：顏色轉成圖解編輯用的文字顏色（<span style="color:#色碼">），之後在圖解裡可以改成實際的顏色 ----
const OPENERS = '([{（［【｛';
const CLOSERS = ')]}）］】｝';
const escapeHtml = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// COLn 後面那一項（可帶前面的數字、BLO/FLO）的結尾位置
function itemEnd(text, from) {
  let j = from;
  const skip = (re) => { const m = re.exec(text.slice(j)); if (m) j += m[0].length; };
  skip(/^\d+\s*/);
  skip(/^(BLO|FLO)\s*-?\s*\d*\s*/i);
  if (OPENERS.includes(text[j] ?? ' ')) {
    let depth = 0;
    for (; j < text.length; j++) {
      if (OPENERS.includes(text[j])) depth++;
      else if (CLOSERS.includes(text[j]) && --depth === 0) return j + 1;
    }
    return text.length;
  }
  skip(/^[A-Za-z]+/);
  return j;
}

// 針法文字轉成帶顏色的 HTML：COLn 標記拿掉、後面那一項用該色；roundHex 有值就整段先用這個顏色
export function colorizeStitchHtml(text, roundHex = null) {
  const src = String(text || '');
  const re = /\bCOL\s*-?\s*([1-3])\s*/gi;
  let out = '';
  let i = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    out += escapeHtml(src.slice(i, m.index));
    const start = m.index + m[0].length;
    const end = itemEnd(src, start);
    out += `<span style="color:${TEXT_COLORS[Number(m[1]) - 1].hex}">${escapeHtml(src.slice(start, end))}</span>`;
    i = end;
    re.lastIndex = end;
  }
  out += escapeHtml(src.slice(i));
  return roundHex ? `<span style="color:${roundHex}">${out}</span>` : out;
}

// 轉成圖解的表格結構（表格＝部位，列＝圈）。withColor 給 3D 預覽用；匯出到圖解時不帶顏色
export function textRowsToTables(rows, { withColor = false, makeId = newRowId } = {}) {
  const tables = [];
  let current = null;
  for (const { row, label, colorIndex, explicit } of labelRows(rows)) {
    if (row.kind === 'P') {
      current = { id: makeId(), part: label, rows: [] };
      tables.push(current);
    } else if (row.kind === 'R') {
      if (!current) {
        current = { id: makeId(), part: 'P1', rows: [] };
        tables.push(current);
      }
      const out = {
        id: makeId(),
        round: label,
        stitch: withColor ? row.stitch || '' : colorizeStitchHtml(row.stitch, explicit ? TEXT_COLORS[colorIndex].hex : null),
        total: row.total || '',
      };
      if (withColor) out.color = TEXT_COLORS[colorIndex].hex;
      current.rows.push(out);
    }
  }
  return tables;
}

// 某個 P 的內容範圍：從 P 那一列到下一個 P 之前；回傳 [起, 止)（止不含）
function groupRange(rows, pId) {
  const start = rows.findIndex((r) => r.id === pId && r.kind === 'P');
  if (start === -1) return null;
  let end = rows.findIndex((r, i) => i > start && r.kind === 'P');
  if (end === -1) end = rows.length;
  return [start, end];
}

// 把新列放進指定 P 的最後面（下一個 P 之前）；找不到那個 P 就放到整張表最後
export function insertInGroup(rows, pId, row) {
  const range = groupRange(rows, pId);
  rows.splice(range ? range[1] : rows.length, 0, row);
}

// 刪掉指定的 P 以及它底下所有的列，回傳被刪掉的列數（含 P 本身）
export function removeGroup(rows, pId) {
  const range = groupRange(rows, pId);
  if (!range) return 0;
  return rows.splice(range[0], range[1] - range[0]).length;
}

// TURN（翻面並換下一圈）：在這一圈針法的結尾補上 TURN；已經以 TURN 結尾就不重複加
export function appendTurn(stitch) {
  const t = String(stitch || '').trim();
  if (!t) return 'TURN';
  return /(^|[\s,，、])TURN$/i.test(t) ? t : `${t}, TURN`;
}

// 把新列放在指定列的正下方；找不到那一列就放到最後
export function insertAfterRow(rows, rowId, row) {
  const i = rows.findIndex((r) => r.id === rowId);
  rows.splice(i === -1 ? rows.length : i + 1, 0, row);
}
