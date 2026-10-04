// 來回編織（TURN）的圈只鉤在前一圈的一小段針目上，不是繞一整圈：預覽要把它們另外收成局部片，
// 不能算進旋轉體，否則 30 針的圈後面接 6 針會被誤畫成收口的圓頂。
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTable } from '../js/views/diagram-preview.js';

const row = (round, stitch, total = '') => ({ round, stitch, total });

test('結尾是 TURN 的圈變成局部片，整圈維持原來的外形（使用者的 R22～R24）', () => {
  const { rounds, strips } = analyzeTable({
    rows: [row('R21', '6(2X, V, X)'), row('R22', '6(2X, V, X)'), row('R23', '6X,CH, TURN'), row('R24', '4X, A, CH,, TURN')],
  });
  assert.deepEqual(rounds.map((r) => r.count), [30, 30]);
  assert.equal(strips.length, 1);
  assert.equal(strips[0].afterRound, 1); // 接在 R22 上面
  assert.deepEqual(strips[0].rows.map((r) => r.count), [6, 5]);
});

test('局部片一直延續到含 DU 的那一列，之後才回到繞圈', () => {
  const { rounds, strips } = analyzeTable({
    rows: [row('R1', '6X'), row('R2', '6V'), row('R3', '4X, TURN'), row('R4', '3X, DU'), row('R5', '12X')],
  });
  assert.deepEqual(strips[0].rows.map((r) => r.count), [4, 3]);
  assert.deepEqual(rounds.map((r) => r.count), [6, 12, 12]);
});

test('沒有 TURN 的圖解不產生局部片；DU 單獨出現（斷線換色）也不算', () => {
  const { strips } = analyzeTable({ rows: [row('R1', '6X'), row('R2', '6V, DU'), row('R3', '12X')] });
  assert.equal(strips.length, 0);
});
