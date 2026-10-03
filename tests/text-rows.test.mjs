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
  assert.deepEqual(tables[0].rows.map((r) => [r.round, r.stitch, r.total]), [['R1', '6X, SL, CH', '6'], ['R2', '6V, SL, CH', '12']]);
  assert.deepEqual(tables[1].rows.map((r) => r.round), ['R1']);
  assert.ok(tables.every((t) => t.rows.every((r) => !('color' in r))));
});

test('3D 預覽用：每個 R 帶著當下的顏色', () => {
  const tables = textRowsToTables([P(), R(), C(1), R()], { withColor: true });
  assert.deepEqual(tables[0].rows.map((r) => r.color), [TEXT_COLORS[0].hex, TEXT_COLORS[1].hex]);
});

import { insertInGroup, removeGroup, appendTurn, insertAfterRow, exportStitchHtml } from '../js/text-rows.js';

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

test('TURN：在這一圈結尾補上 TURN，重複按不會重複加', () => {
  assert.equal(appendTurn(''), 'TURN');
  assert.equal(appendTurn('8X'), '8X, TURN');
  assert.equal(appendTurn('8X, TURN'), '8X, TURN');
  assert.equal(appendTurn('2X, DU, 6X'), '2X, DU, 6X, TURN');
});

test('TURN 換下一圈：新的一圈放在目前這圈的正下方，後面的編號順延', () => {
  const rows = [withId(P(), 'p1'), withId(R(), 'a'), withId(R(), 'b')];
  insertAfterRow(rows, 'a', withId(R(), 'new'));
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'a', 'new', 'b']);
  assert.deepEqual(labelRows(rows).map((l) => l.label), ['P1', 'R1', 'R2', 'R3']);
});

test('單獨一圈換色：R 列自己指定的顏色優先，不影響前後的圈', () => {
  const colors = labelRows([P(), R(), { ...R(), color: 2 }, R()]).map((l) => l.colorIndex);
  assert.deepEqual(colors, [0, 0, 2, 0]);
});

test('單獨一圈換色不會打斷前面的換色：後面的圈仍沿用換色標記的顏色', () => {
  const colors = labelRows([P(), C(1), R(), { ...R(), color: 2 }, R()]).map((l) => l.colorIndex);
  assert.deepEqual(colors, [0, 1, 1, 2, 1]);
});

test('匯出到圖解：針法欄的文字顏色原樣保留（和圖解編輯同格式）', () => {
  const stitch = '6X, <span style="color:#a9c98f">3V</span>';
  assert.equal(exportStitchHtml(stitch), stitch);
  assert.equal(exportStitchHtml('6X'), '6X');
});

test('匯出到圖解：整圈換色讓整段針法用該色，單針換色蓋在上面', () => {
  assert.equal(exportStitchHtml('6X', '#a9c98f'), '<span style="color:#a9c98f">6X</span>');
  assert.equal(
    exportStitchHtml('2X, <span style="color:#e9d28a">X</span>', '#a9c98f'),
    '<span style="color:#a9c98f">2X, <span style="color:#e9d28a">X</span></span>'
  );
});

test('匯出到圖解：沒有指定過顏色的圈不上色；有換色標記或單獨換色的圈才上色', () => {
  const rows = [P(), R('6X', '6'), C(1), R('6V', '12'), { ...R('8X', '8'), color: 2 }];
  const stitches = textRowsToTables(rows)[0].rows.map((r) => r.stitch);
  assert.equal(stitches[0], '6X, SL, CH'); // 還沒換色，維持原樣（結尾自動補收圈）
  assert.equal(stitches[1], '<span style="color:#a9c98f">6V, SL, CH</span>');
  assert.equal(stitches[2], '<span style="color:#e9d28a">8X, SL, CH</span>');
});

test('匯出到圖解：文字裡的 < > & 會被轉義，瀏覽器改寫的 rgb() 也統一成 #色碼', () => {
  assert.equal(exportStitchHtml('2X &lt;b&gt;'), '2X &lt;b&gt;');
  assert.equal(
    exportStitchHtml('<span style="color: rgb(169, 201, 143);">V</span>'),
    '<span style="color:#a9c98f">V</span>'
  );
});

test('3D 預覽用的版本保留針法欄原樣與每圈顏色', () => {
  const stitch = '6X, <span style="color:#a9c98f">3V</span>';
  const rows = [P(), R(stitch, '12')];
  assert.equal(textRowsToTables(rows, { withColor: true })[0].rows[0].stitch, stitch);
});
