// 針法欄是帶文字顏色的內容：要能讀出每個字的顏色，並且存檔時只留下三個換色。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStitchHtml, sanitizeStitchHtml, withClosingRound } from '../js/stitch-html.js';
import { analyzeStitches } from '../js/stitch-count.js';

test('讀出純文字與每個字的顏色（#色碼與瀏覽器改寫的 rgb() 都認得）', () => {
  const a = parseStitchHtml('6X, <span style="color:#a9c98f">3V</span>');
  assert.equal(a.text, '6X, 3V');
  assert.deepEqual(a.charColors, [null, null, null, null, 1, 1]);
  const b = parseStitchHtml('<span style="color: rgb(233, 210, 138);">X</span>');
  assert.deepEqual(b.charColors, [2]);
});

test('不是三個換色的顏色、其他標籤都當成普通文字；<br> 變成空白', () => {
  const r = parseStitchHtml('<b>6X</b><span style="color:#ff0000">X</span><br>V');
  assert.equal(r.text, '6XX V');
  assert.ok(r.charColors.every((c) => c === null));
});

test('巢狀標籤沿用外層顏色，內層另外指定時以內層為準', () => {
  const r = parseStitchHtml('<span style="color:#e7b7a3">2X, <span style="color:#a9c98f">V</span>, X</span>');
  assert.deepEqual(r.charColors, [0, 0, 0, 0, 1, 0, 0, 0]);
});

test('特殊字元會還原成文字，存檔時再轉義', () => {
  assert.equal(parseStitchHtml('a &lt;b&gt; &amp; c').text, 'a <b> & c');
  assert.equal(sanitizeStitchHtml('a &lt;b&gt;'), 'a &lt;b&gt;');
});

test('存檔格式統一：相鄰同色合併成一個 span，其他標籤與樣式拿掉', () => {
  assert.equal(
    sanitizeStitchHtml('<div>6X, <font color="#a9c98f">3</font><span style="color: rgb(169, 201, 143); font-weight:bold">V</span></div>'),
    '6X, <span style="color:#a9c98f">3V</span>'
  );
  assert.equal(sanitizeStitchHtml('6X'), '6X');
  assert.equal(sanitizeStitchHtml(''), '');
});

test('文字顏色直接決定那一針的顏色：只有被上色的針有顏色，總針數不變', () => {
  const { text, charColors } = parseStitchHtml('6X, <span style="color:#a9c98f">3V</span>');
  const r = analyzeStitches(text, charColors);
  assert.equal(r.total, 12);
  assert.deepEqual(r.colors.slice(0, 6), [null, null, null, null, null, null]);
  assert.deepEqual(r.colors.slice(6), [1, 1, 1, 1, 1, 1]); // 3 個加針 = 6 針，同色
});

test('括號的括號本身有沒有上色不影響，裡面每個針法各看各的字', () => {
  const { text, charColors } = parseStitchHtml('(X, <span style="color:#e9d28a">V</span>)');
  assert.deepEqual(analyzeStitches(text, charColors).colors, [null, 2, 2]);
});

test('COLn 標記仍然優先於文字顏色', () => {
  const { text, charColors } = parseStitchHtml('COL1 (<span style="color:#e9d28a">X</span>)');
  assert.deepEqual(analyzeStitches(text, charColors).colors, [0]);
});

test('收圈：圖解常省略結尾的 SL、CH，顯示與匯出時補上，這樣下一圈第一針才會和 SL 同一針目', () => {
  assert.equal(withClosingRound('6X'), '6X, SL, CH');
  assert.equal(withClosingRound('6(X, V)'), '6(X, V), SL, CH');
  assert.equal(withClosingRound('6X, <span style="color:#a9c98f">V</span>'), '6X, <span style="color:#a9c98f">V</span>, SL, CH');
});

test('收圈：已經寫了就不重複；結尾只有 SL 只補 CH', () => {
  assert.equal(withClosingRound('6X, SL, CH'), '6X, SL, CH');
  assert.equal(withClosingRound('6X, SL, 2CH'), '6X, SL, 2CH');
  assert.equal(withClosingRound('6X, SL'), '6X, SL, CH');
});

test('收圈：TURN、DU、只有鎖針的起針圈、空白都不補（它們沒有 SL 接回第一針的收圈）', () => {
  assert.equal(withClosingRound('6X, TURN'), '6X, TURN');
  assert.equal(withClosingRound('6X, DU'), '6X, DU');
  assert.equal(withClosingRound('15CH'), '15CH');
  assert.equal(withClosingRound(''), '');
});
