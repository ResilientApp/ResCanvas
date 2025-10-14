import getAuthUser from '../../../src/utils/getAuthUser';
import { setupLocalStorage } from '../../testUtils';

describe('getAuthUser', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = setupLocalStorage();
  });

  it('should return user from auth object', () => {
    const auth = {
      token: 'test-token',
      user: { username: 'testuser', _id: '123' },
    };

    const user = getAuthUser(auth);

    expect(user).toEqual({ username: 'testuser', _id: '123' });
  });

  it('should return user from localStorage if not in auth object', () => {
    const mockAuth = {
      token: 'test-token',
      user: { username: 'localuser', _id: '456' },
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockAuth));

    const user = getAuthUser({});

    expect(user).toEqual({ username: 'localuser', _id: '456' });
  });

  it('should decode user from JWT token', () => {
    const payload = JSON.stringify({
      sub: '789',
      username: 'jwtuser',
      email: 'jwt@example.com',
    });
    const token = `header.${btoa(payload)}.signature`;
    const auth = { token };

    const user = getAuthUser(auth);

    expect(user).toEqual({
      id: '789',
      username: 'jwtuser',
      email: 'jwt@example.com',
    });
  });

  it('should decode user from token in localStorage', () => {
    const payload = JSON.stringify({
      sub: '999',
      username: 'storageuser',
    });
    const token = `header.${btoa(payload)}.signature`;
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ token }));

    const user = getAuthUser(null);

    expect(user).toEqual({
      id: '999',
      username: 'storageuser',
    });
  });

  it('should return null if no user found', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const user = getAuthUser(null);

    expect(user).toBeNull();
  });

  it('should return null if token is malformed', () => {
    const auth = { token: 'not.a.valid.jwt.token' };

    const user = getAuthUser(auth);

    expect(user).toBeNull();
  });

  it('should handle localStorage parse errors gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid-json');

    const user = getAuthUser(null);

    expect(user).toBeNull();
  });
});
