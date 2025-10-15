export const mockAuthUser = {
  username: 'testuser',
  _id: '507f1f77bcf86cd799439011',
  createdAt: new Date().toISOString(),
};

export const mockToken = 'mock-jwt-token-for-testing';

export const mockAuth = {
  token: mockToken,
  user: mockAuthUser,
};

export const createMockRoom = (overrides = {}) => ({
  id: 'test-room-123',
  name: 'Test Room',
  type: 'public',
  createdBy: mockAuthUser._id,
  createdAt: new Date().toISOString(),
  members: [mockAuthUser._id],
  settings: {
    allowDrawing: true,
    allowViewing: true,
    isPublic: true,
  },
  ...overrides,
});

export const createMockStroke = (overrides = {}) => ({
  id: `stroke-${Date.now()}`,
  drawingId: `drawing-${Date.now()}`,
  user: mockAuthUser.username,
  color: '#FF0000',
  lineWidth: 5,
  pathData: [[10, 20], [30, 40]],
  timestamp: Date.now(),
  brushStyle: 'round',
  order: 1,
  ...overrides,
});

export const setupLocalStorage = () => {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  global.localStorage = localStorageMock;
  return localStorageMock;
};

export const mockFetch = (response, status = 200) => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    })
  );
  return global.fetch;
};

export const waitFor = (callback, options = {}) => {
  const { timeout = 1000, interval = 50 } = options;
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      try {
        const result = callback();
        if (result) {
          resolve(result);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for condition'));
        } else {
          setTimeout(check, interval);
        }
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          reject(error);
        } else {
          setTimeout(check, interval);
        }
      }
    };
    check();
  });
};

export const flushPromises = () => new Promise(resolve => setImmediate(resolve));
