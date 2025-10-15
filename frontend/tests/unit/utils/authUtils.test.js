import {
  handleAuthError,
  isTokenValid,
  getAuthToken,
  setAuthToken,
} from '../../../src/utils/authUtils';
import { setupLocalStorage } from '../../testUtils';

describe('authUtils', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = setupLocalStorage();
    delete window.location;
    window.location = { href: '' };
  });

  describe('handleAuthError', () => {
    it('should redirect to login on unauthorized error', () => {
      const error = new Error('Unauthorized');
      const result = handleAuthError(error);

      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth');
      expect(window.location.href).toBe('/login');
    });

    it('should redirect on 401 error', () => {
      const error = new Error('401: Not authenticated');
      const result = handleAuthError(error);

      expect(result).toBe(true);
      expect(window.location.href).toBe('/login');
    });

    it('should not redirect on other errors', () => {
      const error = new Error('Network error');
      const result = handleAuthError(error);

      expect(result).toBe(false);
      expect(window.location.href).toBe('');
    });
  });

  describe('isTokenValid', () => {
    it('should return false for null token', () => {
      expect(isTokenValid(null)).toBe(false);
    });

    it('should return false for undefined token', () => {
      expect(isTokenValid(undefined)).toBe(false);
    });

    it('should return true for valid token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const payload = JSON.stringify({ exp: futureTime });
      const token = `header.${btoa(payload)}.signature`;

      expect(isTokenValid(token)).toBe(true);
    });

    it('should return false for expired token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const payload = JSON.stringify({ exp: pastTime });
      const token = `header.${btoa(payload)}.signature`;

      expect(isTokenValid(token)).toBe(false);
    });

    it('should return false for malformed token', () => {
      expect(isTokenValid('not.a.valid.jwt')).toBe(false);
    });
  });

  describe('getAuthToken', () => {
    it('should return token from localStorage', () => {
      const mockAuth = { token: 'test-token-123', user: { username: 'testuser' } };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockAuth));

      const token = getAuthToken();

      expect(token).toBe('test-token-123');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('auth');
    });

    it('should return null if no auth in localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const token = getAuthToken();

      expect(token).toBeNull();
    });

    it('should return null if auth is malformed', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const token = getAuthToken();

      expect(token).toBeNull();
    });

    it('should return null if token is missing in auth object', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify({ user: { username: 'test' } }));

      const token = getAuthToken();

      expect(token).toBeNull();
    });
  });

  describe('setAuthToken', () => {
    it('should store token and user in localStorage', () => {
      const token = 'new-token-456';
      const user = { username: 'newuser', _id: '123' };

      setAuthToken(token, user);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'auth',
        JSON.stringify({ token, user })
      );
    });

    it('should not store if token is null', () => {
      setAuthToken(null, { username: 'test' });

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should not store if token is undefined', () => {
      setAuthToken(undefined, { username: 'test' });

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });
});
