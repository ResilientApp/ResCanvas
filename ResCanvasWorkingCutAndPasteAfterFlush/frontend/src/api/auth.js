import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';

export async function register(username, password, walletPubKey) {
  const r = await fetch(`${API_BASE}/auth/register`, {
    credentials: 'include',
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, walletPubKey })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "register failed");
  return j;
}

export async function login(username, password, walletPubKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const r = await fetch(`${API_BASE}/auth/login`, {
      credentials: 'include',
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, walletPubKey }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || "login failed");
    return j;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Login request timed out');
    }
    throw error;
  }
}

export async function getMe(token) {
  const tk = token || getAuthToken();
  const r = await authFetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${tk}` } });
  return await r.json();
}

export async function refreshToken() {
  const r = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'refresh failed');
  return j;
}

export async function logout() {
  const r = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  return await r.json();
}

export async function changePassword(token, newPassword) {
  const tk = token || getAuthToken();
  const r = await authFetch(`${API_BASE}/auth/change_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
    body: JSON.stringify({ password: newPassword })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'change password failed');
  return j;
}
