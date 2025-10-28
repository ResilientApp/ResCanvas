
import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';
import { handleApiResponse, ApiError } from '../utils/errorHandling';

export async function register(username, password, walletPubKey) {
  const r = await fetch(`${API_BASE}/auth/register`, {
    credentials: 'include',
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, walletPubKey })
  });
  return await handleApiResponse(r);
}

export async function login(username, password, walletPubKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(`${API_BASE}/auth/login`, {
      credentials: 'include',
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, walletPubKey }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await handleApiResponse(r);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Login request timed out. Please check your connection and try again.');
      throw timeoutError;
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
  return await handleApiResponse(r);
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
  return await handleApiResponse(r);
}
