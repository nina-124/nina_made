// 3D 預覽的外形：模擬「填充棉花」。
// 每一圈的周長上限由針數決定，圈與圈之間沿布面的距離固定（＝圈高）；塞入棉花後布面被撐開，
// 在這些限制下撐成體積最大的形狀（例如 6,12,18,24,30,24,18,12,6 會撐成一顆球，不是兩個錐體）。
// 做法：從「沒填充」的形狀開始，反覆把每個點沿法線往外推，再把圈距與周長上限拉回限制內。

const ITERATIONS = 400;
const PRESSURE = 0.04; // 側面每次往外推的距離（圈高的倍數）
const POLE_PRESSURE = 0.012; // 極點沿軸線往外推；太大會撐成尖頭，太小會凹陷
const SOLVE_PASSES = 12;

// 輸入每個剖面點的周長上限半徑 rmax、相鄰點的距離 seg，輸出 [r, y] 陣列
export function inflate(rmax, seg, closedStart, closedEnd) {
  const n = rmax.length;
  const r = rmax.slice();
  const y = [0];
  for (let i = 1; i < n; i++) {
    const dr = r[i] - r[i - 1];
    y.push(y[i - 1] + Math.sqrt(Math.max(seg[i - 1] ** 2 - dr * dr, 1e-6)));
  }
  if (n < 3) return r.map((v, i) => [v, y[i]]);

  for (let it = 0; it < ITERATIONS; it++) {
    const nr = r.slice();
    const ny = y.slice();
    for (let i = 1; i < n - 1; i++) {
      const ds = (y[i + 1] - y[i - 1]) / 2;
      const dr = (r[i + 1] - r[i - 1]) / 2;
      const norm = Math.hypot(ds, dr) || 1;
      nr[i] += (PRESSURE * ds * seg[i]) / norm;
      ny[i] -= (PRESSURE * dr * seg[i]) / norm;
    }
    if (closedStart) ny[0] -= POLE_PRESSURE * seg[0];
    if (closedEnd) ny[n - 1] += POLE_PRESSURE * seg[n - 2];
    for (let i = 0; i < n; i++) {
      r[i] = nr[i];
      y[i] = ny[i];
    }
    for (let pass = 0; pass < SOLVE_PASSES; pass++) {
      for (let i = 0; i < n - 1; i++) {
        const dr = r[i + 1] - r[i];
        const dy = y[i + 1] - y[i];
        const d = Math.hypot(dr, dy) || 1e-9;
        const c = ((d - seg[i]) / d) * 0.5;
        r[i] += dr * c;
        r[i + 1] -= dr * c;
        y[i] += dy * c;
        y[i + 1] -= dy * c;
      }
      for (let i = 0; i < n; i++) r[i] = Math.min(Math.max(r[i], 0), rmax[i]);
      r[0] = closedStart ? 0 : rmax[0];
      r[n - 1] = closedEnd ? 0 : rmax[n - 1];
    }
  }
  const lo = Math.min(...y);
  return r.map((v, i) => [v, y[i] - lo]);
}

// Catmull-Rom 平滑；顏色取離原始點較近的那一個
function smooth(points, colors, sub) {
  if (points.length < 3) return points.map((p, i) => [p[0], p[1], colors[i]]);
  const P = [points[0], ...points, points[points.length - 1]];
  const out = [];
  const f = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3);
  for (let i = 1; i < P.length - 2; i++) {
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      out.push([
        Math.max(f(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0], t), 0),
        f(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1], t),
        colors[t < 0.5 ? i - 1 : i],
      ]);
    }
  }
  const last = points.length - 1;
  out.push([points[last][0], points[last][1], colors[last]]);
  return out;
}

// rounds：[{ count, repeat, height, color }]；回傳 [[半徑, 高度, 顏色]]，由下往上
export function inflateProfile(rounds, { stitchWidth, roundHeight, closeThreshold, fallbackColor }) {
  const nodes = [];
  const closedStart = rounds[0].count <= closeThreshold;
  const last = rounds[rounds.length - 1];
  const closedEnd = last.count <= closeThreshold;
  if (closedStart) nodes.push({ rmax: 0, seg: roundHeight * rounds[0].height, color: rounds[0].color ?? fallbackColor });
  for (const { count, repeat, height, color } of rounds) {
    for (let k = 0; k < repeat; k++) {
      nodes.push({ rmax: (count * stitchWidth) / (2 * Math.PI), seg: roundHeight * height, color: color ?? fallbackColor });
    }
  }
  if (closedEnd) nodes.push({ rmax: 0, seg: roundHeight * last.height, color: last.color ?? fallbackColor });

  // 第 i 點到第 i+1 點的距離，用後面那一圈的圈高
  const seg = nodes.slice(1).map((nd) => nd.seg);
  const shaped = inflate(nodes.map((nd) => nd.rmax), seg, closedStart, closedEnd);
  return smooth(shaped, nodes.map((nd) => nd.color), nodes.length > 40 ? 4 : 8);
}
