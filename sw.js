// 網路優先：有網路一律向伺服器確認最新內容（編輯後不會看到舊資料），離線時才用快取。
// GitHub Pages 的檔案帶 max-age=600，瀏覽器預設會直接用舊檔 10 分鐘，所以要用 no-cache 強制每次確認（沒變就是 304，很快）。
// 只處理同源 GET；GitHub API / 登入 token 交換等跨域請求完全不碰。
const CACHE = 'nina-craft-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 資料檔的 ?t=時間戳 每次不同，快取時去掉，離線才讀得到
  const key = url.pathname;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || Response.error()))
  );
});
