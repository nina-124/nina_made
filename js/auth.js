import { verifyPrivateAccess } from './github-api.js';

const AUTH_KEY = 'nina_craft_auth';

export function saveAuth({ username, token }) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ username, token }));
}

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function getToken() {
  return getAuth()?.token || null;
}

export async function login(username, token) {
  const ok = await verifyPrivateAccess(token);
  if (!ok) throw new Error('登入失敗，請確認 token 是否正確、是否有 nina_handmades 的存取權限');
  saveAuth({ username, token });
}
