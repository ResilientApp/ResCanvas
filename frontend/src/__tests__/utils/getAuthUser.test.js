
import getAuthUser from '../../utils/getAuthUser';

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

function createJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'fake-signature';
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('getAuthUser', () => {
  beforeEach(() => {
    store = {};
    jest.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
    localStorageMock.removeItem.mockImplementation((key) => { delete store[key]; });
    localStorageMock.clear.mockImplementation(() => { store = {}; });
  });

  it('should extract user from auth.user', () => {
    const user = { id: 1, username: 'testuser', email: 'test@test.com' };
    const auth = { user, token: 'some-token' };

    expect(getAuthUser(auth)).toEqual(user);
  });

  it('should extract user from localStorage', () => {
    const user = { id: 2, username: 'localuser', email: 'local@test.com' };
    store['auth'] = JSON.stringify({ user });

    expect(getAuthUser(null)).toEqual(user);
  });

  it('should construct user from JWT token payload', () => {
    const token = createJWT({
      sub: 123,
      username: 'jwtuser',
      email: 'jwt@test.com'
    });
    const auth = { token };

    const result = getAuthUser(auth);
    expect(result).toEqual({
      id: 123,
      username: 'jwtuser',
      email: 'jwt@test.com'
    });
  });

  it('should construct partial user from JWT with only sub', () => {
    const token = createJWT({ sub: 456 });
    const auth = { token };

    const result = getAuthUser(auth);
    expect(result).toEqual({ id: 456 });
  });

  it('should construct partial user from JWT with only username', () => {
    const token = createJWT({ username: 'onlyusername' });
    const auth = { token };

    const result = getAuthUser(auth);
    expect(result).toEqual({ username: 'onlyusername' });
  });

  it('should construct partial user from JWT with only email', () => {
    const token = createJWT({ email: 'only@email.com' });
    const auth = { token };

    const result = getAuthUser(auth);
    expect(result).toEqual({ email: 'only@email.com' });
  });

  it('should prefer auth.user over localStorage', () => {
    store['auth'] = JSON.stringify({
      user: { id: 1, username: 'localuser' }
    });

    const auth = {
      user: { id: 2, username: 'authuser' }
    };

    expect(getAuthUser(auth)).toEqual({ id: 2, username: 'authuser' });
  });

  it('should prefer localStorage user over JWT token', () => {
    const token = createJWT({ sub: 3, username: 'tokenuser' });
    store['auth'] = JSON.stringify({
      user: { id: 4, username: 'localuser' },
      token
    });

    const result = getAuthUser({ token });
    expect(result).toEqual({ id: 4, username: 'localuser' });
  });

  it('should return null if no user found', () => {
    expect(getAuthUser(null)).toBe(null);
  });

  it('should return null for empty auth object', () => {
    expect(getAuthUser({})).toBe(null);
  });

  it('should return null for JWT token with no user-related fields', () => {
    const token = createJWT({ exp: 9999999999, iat: 1234567890 });
    const auth = { token };

    expect(getAuthUser(auth)).toBe(null);
  });

  it('should return null for malformed localStorage data', () => {
    store['auth'] = 'invalid-json';
    expect(getAuthUser(null)).toBe(null);
  });

  it('should return null for invalid JWT token format', () => {
    const auth = { token: 'invalid-token' };
    expect(getAuthUser(auth)).toBe(null);
  });

  it('should return null for JWT token with invalid base64', () => {
    const auth = { token: 'header.invalid-base64.signature' };
    expect(getAuthUser(auth)).toBe(null);
  });

  it('should extract user from localStorage token if no auth provided', () => {
    const token = createJWT({ sub: 789, username: 'storeduser' });
    store['auth'] = JSON.stringify({ token });

    const result = getAuthUser(null);
    expect(result).toEqual({ id: 789, username: 'storeduser' });
  });

  it('should handle undefined auth gracefully', () => {
    expect(getAuthUser(undefined)).toBe(null);
  });

  it('should handle null user in auth object', () => {
    const auth = { user: null, token: 'some-token' };
    expect(getAuthUser(auth)).toBe(null);
  });

  it('should handle auth object without user or token', () => {
    const auth = { someOtherField: 'value' };
    expect(getAuthUser(auth)).toBe(null);
  });

  it('should construct user with all available fields from JWT', () => {
    const token = createJWT({
      sub: 'user-id-123',
      username: 'fulluser',
      email: 'full@test.com',
      exp: 9999999999,
      iat: 1234567890
    });
    const auth = { token };

    const result = getAuthUser(auth);
    expect(result).toEqual({
      id: 'user-id-123',
      username: 'fulluser',
      email: 'full@test.com'
    });
  });

  it('should return complete user object from auth.user with extra fields', () => {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@test.com',
      role: 'admin',
      createdAt: '2023-01-01'
    };
    const auth = { user };

    expect(getAuthUser(auth)).toEqual(user);
  });

  it('should handle JWT token without proper structure', () => {
    const auth = { token: 'single-part-token' };
    expect(getAuthUser(auth)).toBe(null);
  });

  it('should handle JWT token with only two parts', () => {
    const auth = { token: 'header.payload' };
    expect(getAuthUser(auth)).toBe(null);
  });
});
