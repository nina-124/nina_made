// 圖解文本的針法欄是「帶文字顏色」的內容（和圖解編輯一樣用 <span style="color:#色碼">）。
// 這裡負責兩件事：
//   parseStitchHtml    → 純文字 + 每個字元的顏色（0～2 對應三個換色，其他顏色或沒顏色為 null），給針數與 3D 預覽用
//   sanitizeStitchHtml → 只留下三個換色的文字顏色，其他標籤、樣式一律拿掉，統一成 <span style="color:#色碼">

import { TEXT_COLORS } from './text-colors.js';
import { analyzeStitches } from './stitch-count.js';

const decode = (t) => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const toHex = (n) => Number(n).toString(16).padStart(2, '0');

// 從 style / color 屬性字串找出是三個換色的哪一個（瀏覽器會把 #色碼 改寫成 rgb(...)，兩種都認）
export function colorIndexOf(attrs) {
  const s = String(attrs || '').toLowerCase();
  const hex = /#([0-9a-f]{6})/.exec(s);
  const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(s);
  const code = hex ? `#${hex[1]}` : rgb ? `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}` : null;
  const i = code ? TEXT_COLORS.findIndex((c) => c.hex === code) : -1;
  return i === -1 ? null : i;
}

// 走過一段 HTML，逐段回報 (文字, 顏色)；巢狀的標籤沒有指定顏色時沿用外層的
function walk(html, onText) {
  const stack = [null];
  for (const part of String(html || '').match(/<\/?[a-zA-Z][^>]*>|[^<]+/g) || []) {
    if (part[0] !== '<') {
      onText(decode(part), stack[stack.length - 1]);
      continue;
    }
    const tag = /^<\/?\s*([a-zA-Z0-9]+)/.exec(part)[1].toLowerCase();
    if (tag === 'br') onText(' ', stack[stack.length - 1]);
    else if (part[1] === '/') {
      if (stack.length > 1) stack.pop();
    } else if (!part.endsWith('/>')) {
      const own = colorIndexOf(part);
      stack.push(own === null ? stack[stack.length - 1] : own);
    }
  }
}

export function parseStitchHtml(html) {
  let text = '';
  const charColors = [];
  walk(html, (chunk, color) => {
    text += chunk;
    for (let i = 0; i < chunk.length; i++) charColors.push(color);
  });
  return { text, charColors };
}

export function sanitizeStitchHtml(html) {
  let out = '';
  let run = '';
  let runColor = null;
  const flush = () => {
    if (!run) return;
    out += runColor === null ? encode(run) : `<span style="color:${TEXT_COLORS[runColor].hex}">${encode(run)}</span>`;
    run = '';
  };
  walk(html, (chunk, color) => {
    if (color !== runColor) flush();
    runColor = color;
    run += chunk;
  });
  flush();
  return out;
}

// 每圈結尾的收圈：最後一針之後 SL 接回本圈第一針、再 CH 一針（起立針）。圖解常省略不寫，所以顯示與匯出時自動補上；
// 不補：空白、TURN（來回編織）、DU（斷線）、沒有任何針目的圈（例如只有鎖針的起針）；
// 結尾已經是 CH 就當作寫過了，結尾是 SL 只補 CH。只回傳加長後的 HTML，不改存檔的內容。
export function withClosingRound(html) {
  const { text } = parseStitchHtml(html);
  const tokens = text.match(/[A-Za-z]+|\d+/g) || [];
  if (!tokens.length || tokens.some((t) => /^(TURN|DU)$/i.test(t))) return html;
  const analysis = analyzeStitches(text);
  if (analysis !== null && analysis.total === 0) return html;
  const last = tokens[tokens.length - 1].toUpperCase();
  if (last === 'CH') return html;
  return `${String(html).trimEnd()}, ${last === 'SL' ? 'CH' : 'SL, CH'}`;
}
