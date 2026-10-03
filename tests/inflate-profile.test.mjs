// 3D 預覽要像鉤出來的填充作品：增減針對稱的圈數應該撐成球，而不是兩個錐體。
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateProfile } from '../js/inflate-profile.js';

const opts = { stitchWidth: 1, roundHeight: 1, closeThreshold: 8, fallbackColor: 0xffffff };
const rounds = (counts) => counts.map((count) => ({ count, repeat: 1, height: 1, color: null }));
const size = (pts) => ({
  width: 2 * Math.max(...pts.map((p) => p[0])),
  height: Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])),
});

test('6,12,18,24,30,24,18,12,6 撐成球：寬與高相近', () => {
  const { width, height } = size(inflateProfile(rounds([6, 12, 18, 24, 30, 24, 18, 12, 6]), opts));
  assert.ok(Math.abs(width - height) / Math.max(width, height) < 0.1, `寬 ${width} 高 ${height}`);
});

test('球的輪廓是圓的：赤道附近的半徑明顯大於靠近極點處（不是直線遞增的菱形）', () => {
  const pts = inflateProfile(rounds([6, 12, 18, 24, 30, 24, 18, 12, 6]), opts);
  const maxR = Math.max(...pts.map((p) => p[0]));
  const mid = pts[Math.floor(pts.length / 2)][0];
  const quarter = pts[Math.floor(pts.length / 4)][0];
  assert.ok(mid > maxR * 0.95);
  assert.ok(quarter > maxR * 0.6, `四分之一處半徑 ${quarter} 太小，像錐體`); // 菱形時約 0.5
});

test('每一圈都不會超過該圈針數撐得出的周長', () => {
  const counts = [6, 12, 18, 24, 30, 24, 18, 12, 6];
  const maxAllowed = Math.max(...counts) / (2 * Math.PI);
  const pts = inflateProfile(rounds(counts), opts);
  assert.ok(Math.max(...pts.map((p) => p[0])) <= maxAllowed + 1e-6);
});

test('每圈針數固定的筒狀不會被撐胖，仍是圓柱', () => {
  const pts = inflateProfile(rounds(Array(8).fill(12)), opts);
  const expected = 12 / (2 * Math.PI);
  assert.ok(pts.every((p) => Math.abs(p[0] - expected) < 0.05));
});

test('顏色跟著圈走', () => {
  const rs = rounds([6, 12, 18, 12, 6]);
  rs[0].color = 0xff0000;
  rs[4].color = 0x0000ff;
  const pts = inflateProfile(rs, opts);
  assert.equal(pts[0][2], 0xff0000);
  assert.equal(pts[pts.length - 1][2], 0x0000ff);
});

// 轉角：相鄰兩段的方向差（度）的最大值
const sharpestTurn = (pts) => {
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(b - a) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    max = Math.max(max, d);
  }
  return max;
};

test('BLO 的那一圈會把布面折出轉角；沒有 BLO 時填充會把轉角磨圓', () => {
  const cup = [6, 12, 18, 24, 24, 24, 24, 24];
  const withBlo = rounds(cup);
  withBlo[4].blo = true; // 第 5 圈整圈 BLO：折點在第 4 圈
  assert.ok(sharpestTurn(inflateProfile(withBlo, opts)) > 60);
  assert.ok(sharpestTurn(inflateProfile(rounds(cup), opts)) < 45);
});

test('BLO 折出轉角後，側壁是直立的（半徑不再變）', () => {
  const withBlo = rounds([6, 12, 18, 24, 24, 24, 24, 24]);
  withBlo[4].blo = true;
  const pts = inflateProfile(withBlo, opts);
  const wallTop = pts.slice(-6).map((p) => p[0]);
  assert.ok(Math.max(...wallTop) - Math.min(...wallTop) < 0.05);
});

test('第一圈就是 BLO、或前一圈是起針極點時不折（沒有可折的位置）', () => {
  const rs = rounds([6, 12, 18]);
  rs[0].blo = true;
  assert.ok(inflateProfile(rs, opts).length > 0);
});

test('貼圖需要的對應：節點屬於哪一圈、取樣點的間隔，與取樣點總數一致', () => {
  const rs = rounds([6, 12, 18, 12, 6]);
  const pts = inflateProfile(rs, opts);
  assert.equal(pts.sub * (pts.nodeRound.length - 1) + 1, pts.length);
  // 兩端是收口的極點（歸到相鄰的那一圈），中間每個節點一圈
  assert.deepEqual(pts.nodeRound, [0, 0, 1, 2, 3, 4, 4]);
});

test('有 BLO 折點分段時，節點與取樣點的對應也一致', () => {
  const rs = rounds([6, 12, 18, 24, 24, 24, 24, 24]);
  rs[4].blo = true;
  const pts = inflateProfile(rs, opts);
  assert.equal(pts.sub * (pts.nodeRound.length - 1) + 1, pts.length);
});

// 每個節點（圈）的半徑：取樣點每隔 sub 個就是一個節點
const nodeRadii = (pts) => pts.filter((_, i) => i % pts.sub === 0).map((p) => p[0]);

test('每兩圈才增一次針的圖解（P3：6,6,9,12,12,…）要是順順的圓錐，不是一階一階的', () => {
  const counts = [6, 6, 9, 12, 12, 15, 15, 18, 18, 20];
  const radii = nodeRadii(inflateProfile(rounds(counts), opts));
  // 沒磨順時，平圈（6,6、12,12…）的半徑會一樣，形成階梯；磨順後每一圈都要比前一圈大
  for (let i = 2; i < radii.length; i++) assert.ok(radii[i] > radii[i - 1] + 1e-6, `第 ${i} 個節點 ${radii[i]} 沒有比前一個 ${radii[i - 1]} 大`);
});

test('磨順不影響極點與需要保持的形狀：球仍是球，圓筒仍是圓柱', () => {
  const ball = inflateProfile(rounds([6, 12, 18, 24, 30, 24, 18, 12, 6]), opts);
  const width = 2 * Math.max(...ball.map((p) => p[0]));
  const height = Math.max(...ball.map((p) => p[1])) - Math.min(...ball.map((p) => p[1]));
  assert.ok(Math.abs(width - height) / Math.max(width, height) < 0.1);
  assert.equal(ball[0][0], 0); // 極點仍在軸線上
});

const dims = (pts) => ({
  width: 2 * Math.max(...pts.map((p) => p[0])),
  height: Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])),
});

test('P2（8,16,24,32,40,45：每圈增針超過平圓盤放得下的量、沒收口）是開口的半球', () => {
  const pts = inflateProfile(rounds([8, 16, 24, 32, 40, 45]), opts);
  const { width, height } = dims(pts);
  assert.ok(Math.abs(width / 2 - height) / height < 0.1, `半球的高應該是寬的一半，寬 ${width} 高 ${height}`);
  // 邊緣是直立的（赤道）：最後兩個取樣點的半徑幾乎一樣
  const rim = pts.slice(-2).map((p) => p[0]);
  assert.ok(Math.abs(rim[0] - rim[1]) < 0.15);
  assert.equal(pts[0][0], 0); // 底部是極點
});

test('每圈增針沒超過平圓盤放得下的量（+6 的杯墊）仍然是平的圓盤，不會被誤判成碗', () => {
  const { width, height } = dims(inflateProfile(rounds([6, 12, 18, 24, 30, 36]), opts));
  assert.ok(height < width / 4, `杯墊應該是平的，寬 ${width} 高 ${height}`);
});

test('半球的半徑不會超過各圈針數撐得出的周長', () => {
  const counts = [8, 16, 24, 32, 40, 45];
  const limit = Math.max(...counts) / (2 * Math.PI);
  assert.ok(Math.max(...inflateProfile(rounds(counts), opts).map((p) => p[0])) <= limit + 1e-6);
});

test('最後一圈是 BLO（P1：…36,36,36 然後 BLO-36X）：不折成朝內的蓋子，最後一圈留在側壁上、側面看得到顏色', () => {
  const counts = [6, 12, 18, ...Array(15).fill(18), 24, 30, 36, 36, 36, 36];
  const rs = rounds(counts);
  rs[counts.length - 1].blo = true;
  const pts = inflateProfile(rs, opts);
  // 最後一圈的那一段：垂直方向的位移要比水平方向大（在壁面上），不是水平朝內的蓋子
  const [r1, y1] = pts[pts.length - 1 - pts.sub];
  const [r2, y2] = pts[pts.length - 1];
  assert.ok(y2 - y1 > Math.abs(r2 - r1), `最後一圈應該在壁面上，dy=${y2 - y1} dr=${r2 - r1}`);
});

test('不是最後一圈的 BLO 仍然折出轉角（後面還有圈數接續）', () => {
  const rs = rounds([6, 12, 18, 24, 24, 24, 24, 24]);
  rs[4].blo = true;
  assert.ok(sharpestTurn(inflateProfile(rs, opts)) > 60);
});
