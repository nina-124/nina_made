// 圖片並行上傳時，GitHub 會因為「分支同時被寫入」回 409。寫入要排隊、遇到這種衝突要自動重試，
// 但檔案內容真的被改過的 409（sha 對不上）不能重試，否則會蓋掉別人的修改。
import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadImageFile, putJsonFile, retry } from '../js/github-api.js';

retry.baseMs = 1;
const REPO = { owner: 'o', repo: 'r' };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('同一個 repo 的寫入一個接一個做，不會同時進行', async () => {
  let active = 0;
  let maxActive = 0;
  globalThis.fetch = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await wait(5);
    active--;
    return json(200, { content: { sha: 'x' } });
  };
  await Promise.all(['a', 'b', 'c', 'd'].map((n) => uploadImageFile(REPO, `img/${n}.jpg`, 'AAAA', 'tok')));
  assert.equal(maxActive, 1);
});

test('分支被同時寫入的 409（is at … but expected …）會自動重試，然後成功', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls < 3 ? json(409, { message: 'assets/img/a.jpg is at A but expected B' }) : json(200, { content: { sha: 'ok' } });
  };
  const res = await uploadImageFile(REPO, 'assets/img/a.jpg', 'AAAA', 'tok');
  assert.equal(calls, 3);
  assert.equal(res.content.sha, 'ok');
});

test('檔案內容真的被改過的 409（sha 對不上）不重試，直接回報', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return json(409, { message: 'data/x.json does not match abc' });
  };
  await assert.rejects(putJsonFile(REPO, 'data/x.json', {}, 'old', 'tok'), /寫入 data\/x\.json 失敗（409）/);
  assert.equal(calls, 1);
});

test('一直衝突不會無限重試：最多試 5 次就回報失敗，訊息保留原本的格式', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return json(409, { message: 'p is at A but expected B' });
  };
  await assert.rejects(uploadImageFile(REPO, 'assets/img/z.jpg', 'AAAA', 'tok'), /上傳 assets\/img\/z\.jpg 失敗（409）：p is at A but expected B/);
  assert.equal(calls, 5);
});

test('其中一個寫入失敗，不會卡住後面排隊的寫入', async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? json(500, { message: 'boom' }) : json(200, { content: { sha: 'ok' } }));
  const results = await Promise.allSettled([
    uploadImageFile(REPO, 'a.jpg', 'AAAA', 'tok'),
    uploadImageFile(REPO, 'b.jpg', 'AAAA', 'tok'),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
});

test('路徑上已經有同名檔案（上次儲存只成功一部分）：查出舊檔的 sha 再覆蓋，不用重新選圖', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, body: init.body ? JSON.parse(init.body) : null });
    if (method === 'GET') return json(200, { sha: 'oldsha' });
    const hasSha = JSON.parse(init.body).sha === 'oldsha';
    return hasSha ? json(200, { content: { sha: 'newsha' } }) : json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
  };
  const res = await uploadImageFile(REPO, 'assets/img/works/a.jpg', 'AAAA', 'tok');
  assert.equal(res.content.sha, 'newsha');
  assert.deepEqual(calls.map((c) => c.method), ['PUT', 'GET', 'PUT']);
  assert.equal(calls[2].body.sha, 'oldsha');
});

test('422 但不是 sha 的問題：原樣回報，不去覆蓋', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return json(422, { message: 'Invalid request. content is not valid base64' });
  };
  await assert.rejects(uploadImageFile(REPO, 'a.jpg', '!!!', 'tok'), /上傳 a\.jpg 失敗（422）/);
  assert.equal(calls, 1);
});
