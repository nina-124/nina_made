import { verifyPrivateAccess } from './github-api.js';

const AUTH_KEY = 'nina_craft_auth';
const CLIENT_ID = 'Ov23liAAJs94bSY3AxUc';
const REDIRECT_URI = 'https://nina-124.github.io/nina_made/login.html';
const TOKEN_EXCHANGE_URL = 'https://nina-craft-oauth.nina-craft-oauth-worker.workers.dev';

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

export function getGithubLoginUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'repo',
    redirect_uri: REDIRECT_URI,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function exchangeCodeForToken(code) {
  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || '登入失敗，請重試');
  return data.access_token;
}

async function fetchGithubUsername(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.login;
}

export async function loginWithCode(code) {
  const token = await exchangeCodeForToken(code);
  const ok = await verifyPrivateAccess(token);
  if (!ok) throw new Error('登入失敗，這個 GitHub 帳號沒有 nina_handmades 的存取權限');
  const username = await fetchGithubUsername(token);
  saveAuth({ username, token });
}
