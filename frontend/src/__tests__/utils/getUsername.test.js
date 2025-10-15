/**
 * Unit Tests: getUsername.js
 * Tests username resolution from auth object, localStorage, or JWT token
 */

import getUsername from '../../utils/getUsername';

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

// Helper to create JWT token
function createJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = 'fake-signature';
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('getUsername', () => {
  beforeEach(() => {
    store = {};
    jest.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
    localStorageMock.removeItem.mockImplementation((key) => { delete store[key]; });
    localStorageMock.clear.mockImplementation(() => { store = {}; });
  });

  it('should extract username from auth.user.username', () => {
    const auth = {
      user: { username: 'testuser' },
      token: 'some-token'
    };

    expect(getUsername(auth)).toBe('testuser');
  });

  it('should extract username from localStorage', () => {
    store['auth'] = JSON.stringify({
      user: { username: 'localstorageuser' }
    });

    expect(getUsername(null)).toBe('localstorageuser');
  });

  it('should extract username from JWT token payload (username field)', () => {
    const token = createJWT({ username: 'jwtuser', exp: 9999999999 });
    const auth = { token };

    expect(getUsername(auth)).toBe('jwtuser');
  });

  it('should extract username from JWT token payload (sub field)', () => {
    const token = createJWT({ sub: 'subuser', exp: 9999999999 });
    const auth = { token };

    expect(getUsername(auth)).toBe('subuser');
  });

  it('should prefer auth.user.username over localStorage', () => {
    store['auth'] = JSON.stringify({
      user: { username: 'localuser' }
    });

    const auth = {
      user: { username: 'authuser' }
    };

    expect(getUsername(auth)).toBe('authuser');
  });

  it('should prefer localStorage over JWT token', () => {
    const token = createJWT({ username: 'tokenuser' });
    store['auth'] = JSON.stringify({
      user: { username: 'localuser' },
      token
    });

    expect(getUsername({ token })).toBe('localuser');
  });

  it('should return null if no username found', () => {
    expect(getUsername(null)).toBe(null);
  });

  it('should return null for empty auth object', () => {
    expect(getUsername({})).toBe(null);
  });

  it('should return null for auth without user', () => {
    expect(getUsername({ token: 'some-token' })).toBe(null);
  });

  it('should return null for malformed localStorage data', () => {
    store['auth'] = 'invalid-json';
    expect(getUsername(null)).toBe(null);
  });

  it('should return null for invalid JWT token', () => {
    const auth = { token: 'invalid-token' };
    expect(getUsername(auth)).toBe(null);
  });

  it('should return null for JWT token with missing username and sub', () => {
    const token = createJWT({ email: 'user@test.com' });
    const auth = { token };
    expect(getUsername(auth)).toBe(null);
  });

  it('should extract username from localStorage token if no auth provided', () => {
    const token = createJWT({ username: 'storedtokenuser' });
    store['auth'] = JSON.stringify({ token });

    expect(getUsername(null)).toBe('storedtokenuser');
  });

  it('should handle auth.user without username property', () => {
    const auth = {
      user: { id: 123, email: 'user@test.com' }
    };
    expect(getUsername(auth)).toBe(null);
  });

  it('should prefer username over sub in JWT payload', () => {
    const token = createJWT({ username: 'username-field', sub: 'sub-field' });
    const auth = { token };
    expect(getUsername(auth)).toBe('username-field');
  });

  it('should handle undefined auth gracefully', () => {
    expect(getUsername(undefined)).toBe(null);
  });

  it('should handle null user in auth object', () => {
    const auth = { user: null, token: 'some-token' };
    expect(getUsername(auth)).toBe(null);
  });
});
