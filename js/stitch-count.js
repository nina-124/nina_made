// 計算圖解「針法」欄的總針數。
// 規則：數字在針法或括號前面代表乘法（2X、3(X,V)）；( ) [ ] { } 與全形括號都只是分組；
// BLO（後半針）、FLO（前半針）寫在數字或針法前面，可接 -，例如 BLO8(X,V,X)、BLO-2(X,V,X)：只影響入針的位置，不影響針數；
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

// 挑線方式的修飾詞：後面緊接著的那組（或那個針法）改從上一圈的半針入針
const LOOP_MODIFIERS = new Set(['BLO', 'FLO']);

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

// 回傳 { total, blo }：total 是這一圈的總針數，blo 是其中挑後半針（BLO）入針的針數；看不懂時回傳 null
export function analyzeStitches(text) {
  const tokens = tokenize(String(text || ''));
  let pos = 0;

  // 解析到遇到對應的結尾括號（或字串結束）為止，回傳 [針數, BLO 針數]；inBlo 表示整段都在 BLO 裡
  function parseSequence(closer, inBlo) {
    let sum = 0;
    let bloSum = 0;
    let pendingBlo = false; // 前一個修飾詞是 BLO，套用在緊接著的那一項
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === closer) return pendingBlo ? null : [sum, bloSum];
      if (CLOSE.has(t)) return null;
      if (/^[,，、]$/.test(t)) {
        if (pendingBlo) return null;
        pos++;
        continue;
      }

      if (LOOP_MODIFIERS.has(t.toUpperCase())) {
        pos++;
        if (tokens[pos] === '-') pos++;
        // 修飾詞後面一定要接數字、括號或針法
        const after = tokens[pos];
        if (after === undefined || !(/^\d+$/.test(after) || OPEN[after] || after.toUpperCase() in STITCH_COUNT)) return null;
        pendingBlo = t.toUpperCase() === 'BLO';
        continue;
      }

      let times = 1;
      if (/^\d+$/.test(t)) {
        times = Number(t);
        pos++;
      }
      const next = tokens[pos];
      if (next === undefined) return null;

      const blo = inBlo || pendingBlo;
      pendingBlo = false;
      let value;
      let bloValue;
      if (OPEN[next]) {
        pos++;
        const inner = parseSequence(OPEN[next], blo);
        if (inner === null || tokens[pos] !== OPEN[next]) return null;
        pos++;
        [value, bloValue] = inner;
      } else {
        const per = STITCH_COUNT[next.toUpperCase()];
        if (per === undefined) return null;
        value = per;
        bloValue = blo ? per : 0;
        pos++;
      }
      sum += times * value;
      bloSum += times * bloValue;
    }
    return closer || pendingBlo ? null : [sum, bloSum];
  }

  const result = parseSequence(null, false);
  return result === null ? null : { total: result[0], blo: result[1] };
}

export function countStitches(text) {
  const result = analyzeStitches(text);
  return result === null ? null : result.total;
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
