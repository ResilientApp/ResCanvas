/**
 * Unit Tests: authUtils.js
 * Tests authentication utility functions including:
 * - Token validation and parsing
 * - Auth error handling
 * - Auth token get/set operations
 * - Auto-refresh fetch wrapper
 */

import {
  handleAuthError,
  withAuthErrorHandling,
  isTokenValid,
  getAuthToken,
  setAuthToken,
  authFetch
} from '../../utils/authUtils';

// Mock localStorage
let store = {};
const localStorageMock = {
  getItem: jest.fn().mockImplementation((key) => store[key] || null),
  setItem: jest.fn().mockImplementation((key, value) => { store[key] = value; }),
  removeItem: jest.fn().mockImplementation((key) => { delete store[key]; }),
  clear: jest.fn().mockImplementation(() => { store = {}; })
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true
});

// Mock window.location
delete window.location;
window.location = { href: '' };

// Mock fetch
global.fetch = jest.fn();

// Helper to create JWT token
function createJWT(payload, expiresIn = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresIn;
  const fullPayload = { ...payload, exp, iat: now };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(fullPayload));
  const signature = 'fake-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('authUtils', () => {
  beforeEach(() => {
    store = {};
    jest.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
    localStorageMock.removeItem.mockImplementation((key) => { delete store[key]; });
    localStorageMock.clear.mockImplementation(() => { store = {}; });
    window.location.href = '';
  });

  describe('handleAuthError', () => {
    it('should handle 401 Unauthorized errors', () => {
      const error = new Error('Unauthorized');
      const result = handleAuthError(error);

      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth');
      expect(window.location.href).toBe('/login');
    });

    it('should handle errors containing 401', () => {
      const error = new Error('Request failed with status 401');
      const result = handleAuthError(error);

      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth');
      expect(window.location.href).toBe('/login');
    });

    it('should not handle non-auth errors', () => {
      const error = new Error('Network error');
      const result = handleAuthError(error);

      expect(result).toBe(false);
      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    });

    it('should handle null error', () => {
      const result = handleAuthError({ message: null });
      expect(result).toBe(false);
    });
  });

  describe('withAuthErrorHandling', () => {
    it('should execute async function successfully', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrapped = withAuthErrorHandling(asyncFn);

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('success');
      expect(asyncFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle auth errors without throwing', async () => {
      const asyncFn = jest.fn().mockRejectedValue(new Error('Unauthorized'));
      const wrapped = withAuthErrorHandling(asyncFn);

      const result = await wrapped();

      expect(result).toBeUndefined();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth');
    });

    it('should re-throw non-auth errors', async () => {
      const asyncFn = jest.fn().mockRejectedValue(new Error('Network error'));
      const wrapped = withAuthErrorHandling(asyncFn);

      await expect(wrapped()).rejects.toThrow('Network error');
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', () => {
      const token = createJWT({ sub: 'user123' }, 3600);
      expect(isTokenValid(token)).toBe(true);
    });

    it('should return false for expired token', () => {
      const token = createJWT({ sub: 'user123' }, -3600);
      expect(isTokenValid(token)).toBe(false);
    });

    it('should return false for null token', () => {
      expect(isTokenValid(null)).toBe(false);
    });

    it('should return false for undefined token', () => {
      expect(isTokenValid(undefined)).toBe(false);
    });

    it('should return false for invalid token format', () => {
      expect(isTokenValid('invalid-token')).toBe(false);
    });

    it('should return false for malformed JWT', () => {
      expect(isTokenValid('header.invalid-base64.signature')).toBe(false);
    });
  });

  describe('getAuthToken', () => {
    it('should retrieve token from localStorage', () => {
      const token = 'test-token-123';
      store['auth'] = JSON.stringify({ token });

      expect(getAuthToken()).toBe(token);
    });

    it('should return null if no auth in localStorage', () => {
      expect(getAuthToken()).toBe(null);
    });

    it('should return null if auth object has no token', () => {
      store['auth'] = JSON.stringify({ user: { id: 1 } });
      expect(getAuthToken()).toBe(null);
    });

    it('should return null if localStorage contains invalid JSON', () => {
      store['auth'] = 'invalid-json';
      expect(getAuthToken()).toBe(null);
    });
  });

  describe('setAuthToken', () => {
    it('should store token and user in localStorage', () => {
      const token = 'test-token';
      const user = { id: 1, username: 'testuser' };

      setAuthToken(token, user);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'auth',
        JSON.stringify({ token, user })
      );
    });

    it('should not store if token is null', () => {
      setAuthToken(null, { id: 1 });
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should not store if token is undefined', () => {
      setAuthToken(undefined, { id: 1 });
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should store token without user', () => {
      const token = 'test-token';
      setAuthToken(token, null);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'auth',
        JSON.stringify({ token, user: null })
      );
    });
  });

  describe('authFetch', () => {
    it('should add Authorization header from localStorage', async () => {
      const token = 'stored-token';
      store['auth'] = JSON.stringify({ token });

      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await authFetch('http://api.test/endpoint');

      expect(fetch).toHaveBeenCalledWith(
        'http://api.test/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`
          })
        })
      );
    });

    it('should work without token in localStorage', async () => {
      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await authFetch('http://api.test/endpoint');

      expect(fetch).toHaveBeenCalled();
    });

    it('should attempt refresh on 401 response', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';
      store['auth'] = JSON.stringify({ token: oldToken, user: { id: 1 } });

      // First call returns 401
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      // Refresh call returns new token
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: newToken })
      });

      // Retry call succeeds
      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const response = await authFetch('http://api.test/endpoint');

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(response.status).toBe(200);

      // Check that new token was stored
      const storedAuth = JSON.parse(store['auth']);
      expect(storedAuth.token).toBe(newToken);
    });

    it('should redirect to login if refresh fails', async () => {
      store['auth'] = JSON.stringify({ token: 'old-token' });

      // First call returns 401
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      // Refresh call fails
      fetch.mockRejectedValueOnce(new Error('Refresh failed'));

      await expect(authFetch('http://api.test/endpoint')).rejects.toThrow('Unauthorized');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth');
      expect(window.location.href).toBe('/login');
    });

    it('should preserve custom headers', async () => {
      const token = 'test-token';
      store['auth'] = JSON.stringify({ token });

      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await authFetch('http://api.test/endpoint', {
        headers: { 'Custom-Header': 'value' }
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://api.test/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Custom-Header': 'value',
            Authorization: `Bearer ${token}`
          })
        })
      );
    });

    it('should handle non-401 errors normally', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const response = await authFetch('http://api.test/endpoint');

      expect(response.status).toBe(500);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
