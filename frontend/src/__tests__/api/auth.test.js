/**
 * Auth API Client Tests
 * 
 * Test coverage:
 * - register: success, validation errors, duplicate username
 * - login: success, invalid credentials, timeout
 * - getMe: success, unauthorized, invalid token
 * - refreshToken: success, expired token, error handling
 * - Error response handling
 * - Network error handling
 */

import { register, login, getMe, refreshToken } from '../../api/auth';
import { API_BASE } from '../../config/apiConfig';

// Mock fetch globally
global.fetch = jest.fn();

// Mock authUtils
jest.mock('../../utils/authUtils', () => ({
  authFetch: jest.fn((url, options) => global.fetch(url, options)),
  getAuthToken: jest.fn(() => 'mock-token-123'),
}));

const { authFetch, getAuthToken } = require('../../utils/authUtils');

describe('Auth API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('register', () => {
    test('successfully registers a new user', async () => {
      const mockResponse = {
        token: 'new-token-123',
        user: { id: 'user123', username: 'newuser' },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await register('newuser', 'password123', null);

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/register`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'newuser', password: 'password123', walletPubKey: null }),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('includes wallet public key when provided', async () => {
      const mockResponse = {
        token: 'new-token-123',
        user: { id: 'user123', username: 'newuser' },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await register('newuser', 'password123', 'wallet-pub-key-abc');

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/register`,
        expect.objectContaining({
          body: JSON.stringify({
            username: 'newuser',
            password: 'password123',
            walletPubKey: 'wallet-pub-key-abc'
          }),
        })
      );
    });

    test('throws error on duplicate username (409)', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Username already exists' }),
      });

      await expect(register('existinguser', 'password123', null))
        .rejects
        .toThrow('Username already exists');
    });

    test('throws error on validation failure (400)', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Password must be at least 6 characters' }),
      });

      await expect(register('user', 'short', null))
        .rejects
        .toThrow('Password must be at least 6 characters');
    });

    test('handles network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(register('user', 'password', null))
        .rejects
        .toThrow('Network error');
    });

    test('error includes status and body', async () => {
      const errorBody = { message: 'Test error', details: 'More info' };
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorBody,
      });

      try {
        await register('user', 'pass', null);
        fail('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.body).toEqual(errorBody);
      }
    });
  });

  describe('login', () => {
    test('successfully logs in user', async () => {
      const mockResponse = {
        token: 'login-token-123',
        user: { id: 'user123', username: 'testuser' },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await login('testuser', 'password123', null);

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/login`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'password123', walletPubKey: null }),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('includes wallet public key when provided', async () => {
      const mockResponse = {
        token: 'login-token-123',
        user: { id: 'user123', username: 'testuser' },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await login('testuser', 'password123', 'wallet-key');

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/login`,
        expect.objectContaining({
          body: JSON.stringify({
            username: 'testuser',
            password: 'password123',
            walletPubKey: 'wallet-key'
          }),
        })
      );
    });

    test('throws error on invalid credentials (401)', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid username or password' }),
      });

      await expect(login('user', 'wrongpass', null))
        .rejects
        .toThrow('Invalid username or password');
    });

    test('handles timeout gracefully', async () => {
      // Simulate AbortController timeout
      const abortError = new Error('Login request timed out');
      abortError.name = 'AbortError';

      global.fetch.mockRejectedValueOnce(abortError);

      await expect(login('user', 'pass', null))
        .rejects
        .toThrow('Login request timed out');
    });

    test('error includes status and body', async () => {
      const errorBody = { message: 'Login failed', reason: 'Account locked' };
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => errorBody,
      });

      try {
        await login('user', 'pass', null);
        fail('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.body).toEqual(errorBody);
      }
    });
  });

  describe('getMe', () => {
    test('successfully gets current user info', async () => {
      const mockResponse = {
        user: { id: 'user123', username: 'testuser', email: 'test@example.com' },
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getMe('test-token');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/me`,
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('uses token from authUtils if not provided', async () => {
      getAuthToken.mockReturnValue('stored-token-456');

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: {} }),
      });

      await getMe();

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/me`,
        expect.objectContaining({
          headers: { Authorization: 'Bearer stored-token-456' },
        })
      );
    });

    test('throws error on unauthorized (401)', async () => {
      authFetch.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { status: 401 })
      );

      await expect(getMe('invalid-token'))
        .rejects
        .toThrow('Unauthorized');
    });

    test('throws error on expired token (401)', async () => {
      authFetch.mockRejectedValueOnce(
        Object.assign(new Error('Token expired'), { status: 401 })
      );

      await expect(getMe('expired-token'))
        .rejects
        .toThrow('Token expired');
    });
  });

  describe('refreshToken', () => {
    test('successfully refreshes token', async () => {
      const mockResponse = {
        token: 'new-refreshed-token-789',
        user: { id: 'user123', username: 'testuser' },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await refreshToken();

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/refresh`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('throws error when refresh fails (401)', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Refresh token expired' }),
      });

      await expect(refreshToken())
        .rejects
        .toThrow('401 Refresh token expired');
    });

    test('throws error with default message if no message provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(refreshToken())
        .rejects
        .toThrow('500 refresh failed');
    });

    test('error includes status and body', async () => {
      const errorBody = { message: 'Expired', code: 'TOKEN_EXPIRED' };
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => errorBody,
      });

      try {
        await refreshToken();
        fail('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(401);
        expect(err.body).toEqual(errorBody);
      }
    });

    test('handles network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(refreshToken())
        .rejects
        .toThrow('Network failure');
    });
  });
});
