/**
 * Authentication API - All endpoints are protected by server-side middleware
 * 
 * Validation: All inputs validated server-side via @validate_request_data
 * - Username: 3-128 chars, alphanumeric + _-.
 * - Password: Min 6 chars
 * 
 * Error Responses:
 * - 400: Bad Request (validation failed) → Show validation error
 * - 401: Unauthorized (invalid credentials) → Show login error
 * - 409: Conflict (username already exists) → Show registration error
 */

import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';
import { handleApiResponse, ApiError } from '../utils/errorHandling';

/**
 * Register a new user
 * Backend: POST /auth/register
 * Middleware: @validate_request_data
 * Validates: username format, password strength
 */
export async function register(username, password, walletPubKey) {
  const r = await fetch(`${API_BASE}/auth/register`, {
    credentials: 'include',
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, walletPubKey })
  });
  return await handleApiResponse(r);
}

/**
 * Login user and get JWT token
 * Backend: POST /auth/login
 * Middleware: @validate_request_data
 * Returns: { token, user } on success
 */
export async function login(username, password, walletPubKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

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

/**
 * Get current authenticated user info
 * Backend: GET /auth/me
 * Middleware: @require_auth
 * Returns: { user } with username, id, etc.
 */
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
