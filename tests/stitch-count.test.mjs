// 這些案例來自使用者實際的圖解寫法與她認定的總針數；規則改動時它們應該失敗。
import test from 'node:test';
import assert from 'node:assert/strict';
import { countStitches, roundHeightOf, analyzeStitches } from '../js/stitch-count.js';

// 只看總針數與 BLO 針數（回傳值另外還有每針的顏色）
const blo = (text) => {
  const r = analyzeStitches(text);
  return r && { total: r.total, blo: r.blo };
};

test('使用者範例一：括號前的數字是重複，CH 不算針，加針算 2', () => {
  assert.equal(countStitches('2CH, [3(X, V), X], 2X,  [3(X, V), X], 2X'), 24);
});

test('使用者範例二：5 是最外層重複次數；SL、CH 都不算針目，所以每次只有 2[2(QTR)] 的 4 針（SL 原本算 1 而得 30，改規則後為 20）', () => {
  assert.equal(countStitches('5(SL, 4CH, 2[2(QTR)], 4CH, SL)'), 20);
});

test('基本針法與乘法', () => {
  assert.equal(countStitches('6X'), 6);
  assert.equal(countStitches('(X,V)'), 3);
  assert.equal(countStitches('10(2X,V)'), 40);
});

test('全形括號、頓號與小寫視同半形', () => {
  assert.equal(countStitches('（x、v）'), 3);
  assert.equal(countStitches('{[(X,V)]}'), 3);
});

test('只有 CH 或空白時為 0', () => {
  assert.equal(countStitches('4CH'), 0);
  assert.equal(countStitches(''), 0);
});

test('不認得的針法或括號不成對時回傳 null，而不是亂算', () => {
  assert.equal(countStitches('3(X,ZZ)'), null);
  assert.equal(countStitches('3(X,V'), null);
  assert.equal(countStitches('X,V)'), null);
  assert.equal(countStitches('(X,V]'), null);
  assert.equal(countStitches('(X,V)*6'), null);
  assert.equal(countStitches('3'), null);
});

test('棗形針、爆米花針、泡芙針一組算 1 針，前面的數字是做幾組', () => {
  assert.equal(countStitches('TCA'), 1);
  assert.equal(countStitches('3FG'), 3);
  assert.equal(countStitches('5(X, PF)'), 10);
});

test('圈高以短針為 1，混用針法取最高的，沒有針法時為 1', () => {
  assert.equal(roundHeightOf('6X'), 1);
  assert.equal(roundHeightOf('6T'), 1.5);
  assert.equal(roundHeightOf('2CH, 3F'), 2);
  assert.equal(roundHeightOf('(X, V), E'), 3);
  assert.equal(roundHeightOf('4CH'), 1);
  assert.equal(roundHeightOf(''), 1);
});

test('BLO/FLO 只影響入針位置，不影響針數（使用者的寫法）', () => {
  assert.equal(countStitches('BLO8(X, V, X)'), 32);
  assert.equal(countStitches('BLO-8(X, V, X)'), 32);
  assert.equal(countStitches('2(X, V, X), BLO-2(X, V, X), 4(X, V, X)'), 32);
  assert.equal(countStitches('8(2X, V, X)'), 40);
  assert.equal(countStitches('FLO6X'), 6);
  assert.equal(countStitches('blo-6X'), 6);
});

test('BLO 後面沒有接東西時視為看不懂，不亂算', () => {
  assert.equal(countStitches('BLO'), null);
  assert.equal(countStitches('BLO-'), null);
  assert.equal(countStitches('6X, BLO'), null);
  assert.equal(countStitches('BLO, 6X'), null);
});

test('BLO 針數：整圈 BLO 與只有部分組別 BLO 要能分辨', () => {
  assert.deepEqual(blo('BLO8(X, V, X)'), { total: 32, blo: 32 });
  assert.deepEqual(blo('2(X, V, X), BLO-2(X, V, X), 4(X, V, X)'), { total: 32, blo: 8 });
  assert.deepEqual(blo('8(2X, V, X)'), { total: 40, blo: 0 });
  assert.deepEqual(blo('BLO(X, 2(V, X))'), { total: 7, blo: 7 });
  assert.equal(analyzeStitches('BLO'), null);
});

test('鎖針起針的兩側：D2 從倒數第 2 針開始，只影響入針位置（使用者實際的圖解）', () => {
  assert.equal(countStitches('15CH'), 0); // 起針不算針目，從第 2 圈開始算
  assert.equal(countStitches('D2 X, T, F, 8E, F, T, (X, SL)'), 14);
  assert.equal(countStitches('X, T, F, 8E, F, T (X, SL)'), 14);
  assert.equal(countStitches('D2X'), 1);
});

test('D 後面沒有數字或沒有接針法時視為看不懂', () => {
  assert.equal(countStitches('D2'), null);
  assert.equal(countStitches('(D2)'), null);
  assert.equal(countStitches('D X'), null);
});

test('DU（斷線）與 TURN（反面）是標記，不算針（使用者的例子）', () => {
  assert.equal(countStitches('8X'), 8);
  assert.equal(countStitches('2X, DU, 6X'), 8);
  assert.equal(countStitches('8X, DU'), 8);
  assert.equal(countStitches('TURN'), 0);
  assert.equal(countStitches('6X, TURN, 6X'), 12);
});

test('TURN 以 T 開頭但不是中長針：不能讓圈高變成 1.5', () => {
  assert.equal(roundHeightOf('6X, TURN'), 1);
  assert.equal(roundHeightOf('6T, TURN'), 1.5);
  assert.equal(roundHeightOf('DU, 6X'), 1);
});

test('COLn 讓緊接著的那幾針換色，不影響針數，顏色依針的順序記錄', () => {
  assert.deepEqual(analyzeStitches('COL2 (3X), 5X').colors, [1, 1, 1, null, null, null, null, null]);
  assert.equal(countStitches('COL2 (3X), 5X'), 8);
  assert.deepEqual(analyzeStitches('X, COL3 V, X').colors, [null, 2, 2, null]); // 加針 V 是兩針，同色
  assert.deepEqual(analyzeStitches('COL1 2(X, V)').colors, [0, 0, 0, 0, 0, 0]);
});

test('COL 在括號內可以再指定另一個顏色；沒有針的標記不佔位置', () => {
  assert.deepEqual(analyzeStitches('COL1 (X, COL2 X, X)').colors, [0, 1, 0]);
  assert.deepEqual(analyzeStitches('COL2 (2X, DU), X').colors, [1, 1, null]);
  assert.equal(analyzeStitches('2X, DU, 6X').colors.length, 8);
});

test('COL 的顏色編號只有 1～3，後面必須接針法或括號，否則看不懂', () => {
  assert.equal(countStitches('COL4 X'), null);
  assert.equal(countStitches('COL0 X'), null);
  assert.equal(countStitches('COL2'), null);
  assert.equal(countStitches('X, COL2'), null);
  assert.equal(countStitches('COL X'), null);
});
