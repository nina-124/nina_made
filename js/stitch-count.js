// 計算圖解「針法」欄的總針數。
// 規則：數字在針法或括號前面代表乘法（2X、3(X,V)）；( ) [ ] { } 與全形括號都只是分組；
// BLO（後半針）、FLO（前半針）寫在數字或針法前面，可接 -，例如 BLO8(X,V,X)、BLO-2(X,V,X)：只影響入針的位置，不影響針數；
// D 加數字（D2）表示從起針鎖針的倒數第 n 針開始鉤，只影響入針位置，不影響針數；
// COL1～COL3 寫在針法或括號前面（COL2 3X、COL3 (X,V)），讓那幾針用三個換色之一，不影響針數；
// DU（斷線，下一針從斷線處的下一針繼續）、TURN（反面）是標記，不算針；
// 以逗號、頓號或空白分隔；CH、SL、K（空針）、環起不算針，其餘每針算 1，加針類算 2、三加類算 3。
// 遇到不認得的針法或括號不成對時回傳 null，由呼叫端決定如何顯示，避免算出錯的數字。

const STITCH_COUNT = {
  X: 1, T: 1, F: 1, E: 1, DTR: 1, QTR: 1,
  V: 2, TV: 2, FV: 2, EV: 2,
  A: 1, TA: 1, FA: 1, EA: 1,
  W: 3, TW: 3, FW: 3, EW: 3,
  M: 1, TM: 1, FM: 1, EM: 1,
  TCA: 1, TQ: 1, FCA: 1, PF: 1, TG: 1, FG: 1, EG: 1, // 棗形針、泡芙針、爆米花針：一組都鉤在同一針目，算 1 針
  CH: 0, SL: 0, K: 0, // 鎖針、引拔針、空針（K，跳過一針不鉤）都不算針目
  DU: 0, TURN: 0, // 斷線、反面是標記，不算針目
};

// 每種針法的高度（以短針為 1，估計值）；同一圈混用多種針法時取最高的
const HEIGHT_BY_PREFIX = [['DTR', 4], ['QTR', 5], ['PF', 2], ['T', 1.5], ['F', 2], ['E', 3]];

function stitchHeight(name) {
  const hit = HEIGHT_BY_PREFIX.find(([prefix]) => name.startsWith(prefix));
  return hit ? hit[1] : 1;
}

// 挑線方式的修飾詞：後面緊接著的那組（或那個針法）改從上一圈的半針入針
const COLOR_COUNT = 3; // COL1～COL3，對應圖解文本的三個換色

const LOOP_MODIFIERS = new Set(['BLO', 'FLO']);

const OPEN = { '(': ')', '（': '）', '[': ']', '［': '］', '【': '】', '{': '}', '｛': '｝' };
const CLOSE = new Set(Object.values(OPEN));
const TOKEN = /\s*(\d+|[A-Za-z]+|[()（）[\]［］【】{}｛｝]|[,，、]|\S)/gy;

// 每個 token 在原文裡的起點也一併記下來，用來查那個字的顏色
function tokenizeWithPos(text) {
  const tokens = [];
  const starts = [];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    tokens.push(m[1]);
    starts.push(m.index + m[0].length - m[1].length);
  }
  return { tokens, starts };
}

function tokenize(text) {
  return tokenizeWithPos(text).tokens;
}

// 回傳 { total, blo, colors }；看不懂時回傳 null
//   total：這一圈的總針數；blo：其中挑後半針（BLO）入針的針數
//   colors：長度等於 total，依針的順序記錄每一針的顏色（0～2，沒指定為 null）
// charColors：原文每個字元的顏色（0～2 或 null），針法那幾個字被上了顏色，那一針就是該色；
//   優先順序：COLn 標記 > 外層括號的 COLn > 字元顏色
export function analyzeStitches(text, charColors = null) {
  const { tokens, starts } = tokenizeWithPos(String(text || ''));
  let pos = 0;
  const startsItem = (tk) => tk !== undefined && (/^\d+$/.test(tk) || OPEN[tk] || tk.toUpperCase() in STITCH_COUNT);

  // 解析到遇到對應的結尾括號（或字串結束）為止，回傳 [針數, BLO 針數, 每針顏色]
  // inBlo / inColor：整段都在 BLO / 同一個顏色裡
  function parseSequence(closer, inBlo, inColor) {
    let sum = 0;
    let bloSum = 0;
    const colors = [];
    let pendingBlo = false; // 前一個修飾詞是 BLO，套用在緊接著的那一項
    let pendingColor = null; // 前一個修飾詞是 COLn，套用在緊接著的那一項
    const pending = () => pendingBlo || pendingColor !== null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === closer) return pending() ? null : [sum, bloSum, colors];
      if (CLOSE.has(t)) return null;
      if (/^[,，、]$/.test(t)) {
        if (pending()) return null;
        pos++;
        continue;
      }

      // D2：從倒數第 2 針開始；後面一定要接針法或括號
      if (t.toUpperCase() === 'D' && /^\d+$/.test(tokens[pos + 1] ?? '')) {
        pos += 2;
        const after = tokens[pos];
        if (after === undefined || after === closer || CLOSE.has(after) || pending()) return null;
        continue;
      }

      if (LOOP_MODIFIERS.has(t.toUpperCase())) {
        pos++;
        if (tokens[pos] === '-') pos++;
        // 修飾詞後面一定要接數字、括號或針法
        if (!startsItem(tokens[pos])) return null;
        pendingBlo = t.toUpperCase() === 'BLO';
        continue;
      }

      // COL2：緊接著的那一針（或那一組括號）用顏色 2；顏色只有 1～COLOR_COUNT
      if (t.toUpperCase() === 'COL') {
        pos++;
        if (tokens[pos] === '-') pos++;
        const n = tokens[pos];
        if (!/^\d+$/.test(n ?? '') || Number(n) < 1 || Number(n) > COLOR_COUNT) return null;
        pos++;
        if (!startsItem(tokens[pos])) return null;
        pendingColor = Number(n) - 1;
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
      const color = pendingColor ?? inColor;
      pendingBlo = false;
      pendingColor = null;
      let value;
      let bloValue;
      let itemColors;
      if (OPEN[next]) {
        pos++;
        const inner = parseSequence(OPEN[next], blo, color);
        if (inner === null || tokens[pos] !== OPEN[next]) return null;
        pos++;
        [value, bloValue, itemColors] = inner;
      } else {
        const per = STITCH_COUNT[next.toUpperCase()];
        if (per === undefined) return null;
        value = per;
        bloValue = blo ? per : 0;
        const ownColor = color ?? (charColors ? charColors[starts[pos]] ?? null : null);
        itemColors = Array(per).fill(ownColor);
        pos++;
      }
      sum += times * value;
      bloSum += times * bloValue;
      for (let k = 0; k < times; k++) colors.push(...itemColors);
    }
    return closer || pending() ? null : [sum, bloSum, colors];
  }

  const result = parseSequence(null, false, null);
  return result === null ? null : { total: result[0], blo: result[1], colors: result[2] };
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
    if (STITCH_COUNT[name] > 0) height = Math.max(height, stitchHeight(name)); // 不算針的標記不影響圈高
  }
  return height;
}
