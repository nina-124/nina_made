// 計算圖解「針法」欄的總針數。
// 規則：數字在針法或括號前面代表乘法（2X、3(X,V)）；( ) [ ] { } 與全形括號都只是分組；
// 以逗號、頓號或空白分隔；CH、環起不算針，其餘每針算 1，加針類算 2、三加類算 3。
// 遇到不認得的針法或括號不成對時回傳 null，由呼叫端決定如何顯示，避免算出錯的數字。

const STITCH_COUNT = {
  X: 1, T: 1, F: 1, E: 1, DTR: 1, QTR: 1, SL: 1,
  V: 2, TV: 2, FV: 2, EV: 2,
  A: 1, TA: 1, FA: 1, EA: 1,
  W: 3, TW: 3, FW: 3, EW: 3,
  M: 1, TM: 1, FM: 1, EM: 1,
  TCA: 1, TQ: 1, FCA: 1, PF: 1, TG: 1, FG: 1, EG: 1, // 棗形針、泡芙針、爆米花針：一組都鉤在同一針目，算 1 針
  CH: 0,
};

// 每種針法的高度（以短針為 1，估計值）；同一圈混用多種針法時取最高的
const HEIGHT_BY_PREFIX = [['DTR', 4], ['QTR', 5], ['PF', 2], ['T', 1.5], ['F', 2], ['E', 3]];

function stitchHeight(name) {
  const hit = HEIGHT_BY_PREFIX.find(([prefix]) => name.startsWith(prefix));
  return hit ? hit[1] : 1;
}

const OPEN = { '(': ')', '（': '）', '[': ']', '［': '］', '【': '】', '{': '}', '｛': '｝' };
const CLOSE = new Set(Object.values(OPEN));
const TOKEN = /\s*(\d+|[A-Za-z]+|[()（）[\]［］【】{}｛｝]|[,，、]|\S)/gy;

function tokenize(text) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(text)) !== null) tokens.push(m[1]);
  return tokens;
}

export function countStitches(text) {
  const tokens = tokenize(String(text || ''));
  let pos = 0;

  // sequence 解析到遇到對應的結尾括號（或字串結束）為止
  function parseSequence(closer) {
    let sum = 0;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === closer) return sum;
      if (CLOSE.has(t)) return null;
      if (/^[,，、]$/.test(t)) { pos++; continue; }

      let times = 1;
      if (/^\d+$/.test(t)) {
        times = Number(t);
        pos++;
      }
      const next = tokens[pos];
      if (next === undefined) return null;

      let value;
      if (OPEN[next]) {
        pos++;
        value = parseSequence(OPEN[next]);
        if (value === null || tokens[pos] !== OPEN[next]) return null;
        pos++;
      } else {
        const per = STITCH_COUNT[next.toUpperCase()];
        if (per === undefined) return null;
        value = per;
        pos++;
      }
      sum += times * value;
    }
    return closer ? null : sum;
  }

  const total = parseSequence(null);
  return total;
}

// 這一圈的高度（短針 = 1）：取用到的針法中最高的；沒有可辨識的針法時視為 1
export function roundHeightOf(text) {
  let height = 1;
  for (const t of tokenize(String(text || ''))) {
    const name = t.toUpperCase();
    if (name in STITCH_COUNT) height = Math.max(height, stitchHeight(name));
  }
  return height;
}
