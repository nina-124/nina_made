// 圖解文本的列資料與規則（不碰畫面，方便測試）。
// 一份文本是一串列：P＝部位（開一張新表）、R＝圈、C＝換色標記。
// 標記不存檔，每次依順序算出：P 依序 P1、P2…；R 在每個 P 底下重新從 R1 開始。
// 換色只影響它後面的 R，直到下一個換色；遇到新的 P 就回到預設色（第一個顏色）。

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

// 回傳每列的 { row, label, colorIndex }；colorIndex 是該列（R）實際使用的顏色
export function labelRows(rows) {
  let p = 0;
  let r = 0;
  let colorIndex = 0;
  return (rows || []).map((row) => {
    if (row.kind === 'P') {
      p += 1;
      r = 0;
      colorIndex = 0;
      return { row, label: `P${p}`, colorIndex };
    }
    if (row.kind === 'C') {
      colorIndex = TEXT_COLORS[row.color] ? row.color : 0;
      return { row, label: '換色', colorIndex };
    }
    r += 1;
    return { row, label: `R${r}`, colorIndex };
  });
}

// 轉成圖解的表格結構（表格＝部位，列＝圈）。withColor 給 3D 預覽用；匯出到圖解時不帶顏色
export function textRowsToTables(rows, { withColor = false, makeId = newRowId } = {}) {
  const tables = [];
  let current = null;
  for (const { row, label, colorIndex } of labelRows(rows)) {
    if (row.kind === 'P') {
      current = { id: makeId(), part: label, rows: [] };
      tables.push(current);
    } else if (row.kind === 'R') {
      if (!current) {
        current = { id: makeId(), part: 'P1', rows: [] };
        tables.push(current);
      }
      const out = { id: makeId(), round: label, stitch: row.stitch || '', total: row.total || '' };
      if (withColor) out.color = TEXT_COLORS[colorIndex].hex;
      current.rows.push(out);
    }
  }
  return tables;
}
