/**
 * Tests for Socket Module
 */

const SocketClient = require('../src/modules/socket').default;

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: false,
  id: 'mock-socket-id',
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

const { io } = require('socket.io-client');

describe('SocketClient', () => {
  let socketClient;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.disconnect.mockClear();

    mockClient = {
      config: { baseUrl: 'http://localhost:10010' },
    };

    socketClient = new SocketClient(mockClient);
  });

  describe('connect', () => {
    it('should connect to the socket server', async () => {
      // Simulate successful connection
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const connectPromise = socketClient.connect('valid-token');

      await connectPromise;

      expect(io).toHaveBeenCalledWith('http://localhost:10010', {
        auth: { token: 'valid-token' },
        transports: ['websocket', 'polling'],
      });
      expect(socketClient.connected).toBe(true);
    });

    it('should handle connection errors', async () => {
      // Simulate connection error
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(socketClient.connect('invalid-token')).rejects.toThrow('Connection failed');
      expect(socketClient.connected).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the socket server', async () => {
      // Setup socket first
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await socketClient.connect('valid-token');
      socketClient.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(socketClient.socket).toBeNull();
      expect(socketClient.connected).toBe(false);
    });
  });

  describe('event listeners', () => {
    beforeEach(async () => {
      // Connect before testing event methods
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });
      await socketClient.connect('valid-token');
      mockSocket.on.mockClear(); // Clear connect event listeners
    });

    it('should register event listener', () => {
      const handler = jest.fn();
      socketClient.on('new_line', handler);

      expect(mockSocket.on).toHaveBeenCalledWith('new_line', handler);
    });

    it('should remove event listener', () => {
      const handler = jest.fn();
      socketClient.on('new_line', handler);
      socketClient.off('new_line', handler);

      expect(mockSocket.off).toHaveBeenCalledWith('new_line', handler);
    });

    it('should emit custom event', () => {
      socketClient.emit('custom_event', { data: 'test' });

      expect(mockSocket.emit).toHaveBeenCalledWith('custom_event', { data: 'test' });
    });
  });

  describe('room management', () => {
    beforeEach(async () => {
      // Connect before testing room methods
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });
      await socketClient.connect('valid-token');
    });

    it('should join a room', () => {
      socketClient.joinRoom('room123');

      expect(mockSocket.emit).toHaveBeenCalledWith('join_room', { roomId: 'room123' });
      expect(socketClient.currentRooms.has('room123')).toBe(true);
    });

    it('should leave a room', () => {
      socketClient.joinRoom('room123');
      socketClient.leaveRoom('room123');

      expect(mockSocket.emit).toHaveBeenCalledWith('leave_room', { roomId: 'room123' });
      expect(socketClient.currentRooms.has('room123')).toBe(false);
    });

    it('should get joined rooms', () => {
      socketClient.joinRoom('room1');
      socketClient.joinRoom('room2');

      const rooms = socketClient.getJoinedRooms();
      expect(rooms.size).toBe(2);
      expect(rooms.has('room1')).toBe(true);
      expect(rooms.has('room2')).toBe(true);
    });
  });

  describe('connection state', () => {
    it('should return connection status', async () => {
      // Connect first to set up socket
      mockSocket.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });
      await socketClient.connect('valid-token');
      mockSocket.connected = true;

      const isConnected = socketClient.isConnected();

      expect(isConnected).toBe(true);
    });
  });
});
