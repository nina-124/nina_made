export const PUBLIC_REPO = { owner: 'nina-124', repo: 'nina_made' };
export const PRIVATE_REPO = { owner: 'nina-124', repo: 'nina_handmades' };

const API = 'https://api.github.com';

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64DecodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function authHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function verifyPrivateAccess(token) {
  const res = await fetch(`${API}/repos/${PRIVATE_REPO.owner}/${PRIVATE_REPO.repo}`, {
    headers: authHeaders(token),
  });
  return res.ok;
}

export async function getJsonFile(repo, path, token) {
  const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`讀取 ${path} 失敗（${res.status}）`);
  const json = await res.json();
  return { data: JSON.parse(b64DecodeUtf8(json.content)), sha: json.sha };
}

// GitHub 的寫入每次都會產生一個 commit。同一個分支同時寫入時，後到的會拿到過期的分支位置而回 409
// （訊息像「…is at A but expected B」）。所以同一個 repo 的寫入排隊一個接一個做；
// 萬一還是遇到（例如另一台裝置同時在寫），稍等再試。檔案內容真的被改過的 409（sha 對不上）不重試，以免蓋掉別人的修改。
const writeQueues = new Map();
export const retry = { baseMs: 300 }; // 重試前等待的基準時間（毫秒），測試時會縮短
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writeContents(repo, path, body, token, failLabel) {
  const key = `${repo.owner}/${repo.repo}`;
  const run = (writeQueues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const err = await res.json().catch(() => ({}));
      const branchRace = res.status === 409 && /but expected/.test(err.message || '');
      if (branchRace && attempt < 4) {
        await sleep(retry.baseMs * 2 ** attempt + Math.random() * retry.baseMs);
        continue;
      }
      throw Object.assign(new Error(`${failLabel}（${res.status}）：${err.message || ''}`), { status: res.status, apiMessage: err.message || '' });
    }
  });
  writeQueues.set(key, run);
  return run;
}

export function putJsonFile(repo, path, dataObj, sha, token, message) {
  return writeContents(
    repo,
    path,
    {
      message: message || `更新 ${path}`,
      content: b64EncodeUtf8(JSON.stringify(dataObj, null, 2)),
      ...(sha ? { sha } : {}),
    },
    token,
    `寫入 ${path} 失敗`
  );
}

export async function getRawFileBase64(repo, path, token) {
  const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`讀取 ${path} 失敗（${res.status}）`);
  const json = await res.json();
  return json.content;
}

// 目前這個路徑上檔案的 sha；檔案不存在就回傳 null
async function getFileSha(repo, path, token) {
  const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`讀取 ${path} 失敗（${res.status}）`);
  return (await res.json()).sha || null;
}

// 新增或覆蓋圖片。路徑上已經有檔案時（例如上次儲存只成功了一部分，這次重新上傳同一個檔名），
// GitHub 會回 422「"sha" wasn't supplied」，這時查出現有檔案的 sha，再用它覆蓋。
export async function uploadImageFile(repo, path, base64Content, token, message) {
  const body = { message: message || `新增圖片 ${path}`, content: base64Content };
  const failLabel = `上傳 ${path} 失敗`;
  try {
    return await writeContents(repo, path, body, token, failLabel);
  } catch (err) {
    if (err.status !== 422 || !/sha/.test(err.apiMessage || '')) throw err;
    const sha = await getFileSha(repo, path, token);
    if (!sha) throw err;
    return writeContents(repo, path, { ...body, sha }, token, failLabel);
  }
}
