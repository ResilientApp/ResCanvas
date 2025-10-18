/**
 * Tests for Auth Module
 */

const AuthClient = require('../src/modules/auth').default;

describe('AuthClient', () => {
  let authClient;
  let mockRequest;

  beforeEach(() => {
    mockRequest = jest.fn();
    authClient = new AuthClient({
      _request: mockRequest,
      setToken: jest.fn()
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const mockResponse = {
        status: 'ok',
        token: 'test-token',
        user: { id: '1', username: 'testuser' },
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await authClient.register({ username: 'testuser', password: 'password123' });

      expect(mockRequest).toHaveBeenCalledWith('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle registration errors', async () => {
      mockRequest.mockRejectedValue(new Error('Username already exists'));

      await expect(authClient.register({ username: 'testuser', password: 'password123' })).rejects.toThrow(
        'Username already exists'
      );
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        status: 'ok',
        token: 'test-token',
        user: { id: '1', username: 'testuser' },
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await authClient.login({ username: 'testuser', password: 'password123' });

      expect(mockRequest).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle invalid credentials', async () => {
      mockRequest.mockRejectedValue(new Error('Invalid credentials'));

      await expect(authClient.login({ username: 'testuser', password: 'wrongpass' })).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await authClient.logout();

      expect(mockRequest).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('getMe', () => {
    it('should get current user info', async () => {
      const mockUser = {
        user: { id: '1', username: 'testuser', role: 'user' },
      };
      mockRequest.mockResolvedValue(mockUser);

      const result = await authClient.getMe();

      expect(mockRequest).toHaveBeenCalledWith('/auth/me', { method: 'GET' });
      expect(result).toEqual(mockUser);
    });

    it('should handle unauthorized access', async () => {
      mockRequest.mockRejectedValue(new Error('Unauthorized'));

      await expect(authClient.getMe()).rejects.toThrow('Unauthorized');
    });
  });

  describe('refresh', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = { token: 'new-token' };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await authClient.refresh();

      expect(mockRequest).toHaveBeenCalledWith('/auth/refresh', { method: 'POST' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await authClient.changePassword('newpass');

      expect(mockRequest).toHaveBeenCalledWith('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ password: 'newpass' }),
      });
      expect(result).toEqual({ status: 'ok' });
    });

    it('should handle incorrect old password', async () => {
      mockRequest.mockRejectedValue(new Error('Incorrect password'));

      await expect(authClient.changePassword('newpass')).rejects.toThrow(
        'Incorrect password'
      );
    });
  });
});
