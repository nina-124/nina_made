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

export async function putJsonFile(repo, path, dataObj, sha, token, message) {
  const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `更新 ${path}`,
      content: b64EncodeUtf8(JSON.stringify(dataObj, null, 2)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`寫入 ${path} 失敗（${res.status}）：${err.message || ''}`);
  }
  return res.json();
}

export async function uploadImageFile(repo, path, base64Content, token, message) {
  const res = await fetch(`${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `新增圖片 ${path}`,
      content: base64Content,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`上傳 ${path} 失敗（${res.status}）：${err.message || ''}`);
  }
  return res.json();
}
