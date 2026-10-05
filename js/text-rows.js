// 圖解文本的列資料與規則（不碰畫面，方便測試）。
// 一份文本是一串列：P＝部位（開一張新表）、R＝圈、C＝換色標記。
// 標記不存檔，每次依順序算出：P 依序 P1、P2…；圈數只顯示數字（1、2、3…），在每個 P 底下重新從 1 開始。
// 換色只影響它後面的 R，直到下一個換色；遇到新的 P 就回到預設色（第一個顏色）。
// 單獨一圈換色：R 列自己的 color（0～2）優先於前面的換色；單獨幾針換色直接上在針法文字的顏色上（見 stitch-html.js）。

import { TEXT_COLORS } from './text-colors.js';
import { sanitizeStitchHtml, parseStitchHtml, withClosingRound } from './stitch-html.js';

export { TEXT_COLORS };

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
    return { row, label: String(r), colorIndex: own ?? colorIndex, explicit: own !== null || colorChanged };
  });
}

// 匯出到圖解：針法欄本來就是圖解編輯用的文字顏色格式；整圈換色就再外包一層，單針的顏色蓋在它上面
export function exportStitchHtml(html, roundHex = null) {
  const body = sanitizeStitchHtml(html);
  return roundHex ? `<span style="color:${roundHex}">${body}</span>` : body;
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
        stitch: withColor ? row.stitch || '' : exportStitchHtml(withClosingRound(row.stitch), explicit ? TEXT_COLORS[colorIndex].hex : null),
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
  const html = sanitizeStitchHtml(stitch);
  const text = parseStitchHtml(html).text.trim();
  if (!text) return 'TURN';
  return /(^|[\s,，、])TURN$/i.test(text) ? html : `${html.trimEnd()}, TURN`;
}

// 把新列放在指定列的正下方；找不到那一列就放到最後
export function insertAfterRow(rows, rowId, row) {
  const i = rows.findIndex((r) => r.id === rowId);
  rows.splice(i === -1 ? rows.length : i + 1, 0, row);
}
