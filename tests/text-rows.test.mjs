// 對應示意圖 18：R 的編號在每個 P 底下重新開始；換色只影響後面的圈，遇到新的 P 回到預設色。
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelRows, textRowsToTables, TEXT_COLORS } from '../js/text-rows.js';

const P = () => ({ kind: 'P' });
const R = (stitch = '', total = '') => ({ kind: 'R', stitch, total });
const C = (color) => ({ kind: 'C', color });

test('P 依序編號，R 在每個 P 底下重新從 R1 開始', () => {
  const labels = labelRows([P(), R(), R(), P(), R(), R()]).map((l) => l.label);
  assert.deepEqual(labels, ['P1', 'R1', 'R2', 'P2', 'R1', 'R2']);
});

test('刪掉中間的列後，編號會自動接上', () => {
  const rows = [P(), R(), R(), R()];
  rows.splice(1, 1);
  assert.deepEqual(labelRows(rows).map((l) => l.label), ['P1', 'R1', 'R2']);
});

test('換色只影響後面的圈，遇到新的 P 回到預設色', () => {
  const colors = labelRows([P(), R(), C(2), R(), R(), P(), R()]).map((l) => l.colorIndex);
  assert.deepEqual(colors, [0, 0, 2, 2, 2, 0, 0]);
});

test('匯出：每個 P 變成一張表，標題是 P1、P2，R 變成該表的列，且不帶顏色', () => {
  const tables = textRowsToTables([P(), R('6X', '6'), R('6V', '12'), P(), R('12X', '12')]);
  assert.deepEqual(tables.map((t) => t.part), ['P1', 'P2']);
  assert.deepEqual(tables[0].rows.map((r) => [r.round, r.stitch, r.total]), [['R1', '6X', '6'], ['R2', '6V', '12']]);
  assert.deepEqual(tables[1].rows.map((r) => r.round), ['R1']);
  assert.ok(tables.every((t) => t.rows.every((r) => !('color' in r))));
});

test('3D 預覽用：每個 R 帶著當下的顏色', () => {
  const tables = textRowsToTables([P(), R(), C(1), R()], { withColor: true });
  assert.deepEqual(tables[0].rows.map((r) => r.color), [TEXT_COLORS[0].hex, TEXT_COLORS[1].hex]);
});

import { insertInGroup, removeGroup } from '../js/text-rows.js';

const withId = (row, id) => ({ ...row, id });

test('在指定 P 底下新增列，會放在該 P 的最後、下一個 P 之前，編號自動接上', () => {
  const rows = [withId(P(), 'p1'), withId(R(), 'a'), withId(P(), 'p2'), withId(R(), 'b')];
  insertInGroup(rows, 'p1', withId(R(), 'new'));
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'a', 'new', 'p2', 'b']);
  assert.deepEqual(labelRows(rows).map((l) => l.label), ['P1', 'R1', 'R2', 'P2', 'R1']);
});

test('指定的 P 是最後一個時，新增的列放在表格最後', () => {
  const rows = [withId(P(), 'p1'), withId(R(), 'a')];
  insertInGroup(rows, 'p1', withId(R(), 'new'));
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'a', 'new']);
});

test('刪除一個 P 會連同它底下的列一起刪，不動其他 P，後面的 P 編號自動遞補', () => {
  const rows = [withId(P(), 'p1'), withId(R(), 'a'), withId(R(), 'b'), withId(P(), 'p2'), withId(R(), 'c')];
  assert.equal(removeGroup(rows, 'p1'), 3);
  assert.deepEqual(rows.map((r) => r.id), ['p2', 'c']);
  assert.deepEqual(labelRows(rows).map((l) => l.label), ['P1', 'R1']);
});
