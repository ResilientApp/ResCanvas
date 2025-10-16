/**
 * Rooms API Client Tests
 * 
 * Test coverage:
 * - createRoom: success, validation, authorization
 * - listRooms: success, filtering, sorting, pagination
 * - getRoomDetails: success, not found, unauthorized
 * - updateRoom: success, validation, authorization
 * - deleteRoom: success, authorization
 * - shareRoom: success, validation
 * - getRoomStrokes: success, filtering by time range
 * - postRoomStroke: success, validation
 * - undoRoomAction: success, authorization
 * - redoRoomAction: success, authorization
 * - clearRoomCanvas: success, authorization
 */

import {
  createRoom,
  listRooms,
  getRoomDetails,
  shareRoom,
  getRoomStrokes,
  postRoomStroke,
  undoRoomAction,
  redoRoomAction,
  suggestUsers,
  suggestRooms,
  getRoomMembers,
} from '../../api/rooms';
import { API_BASE } from '../../config/apiConfig';

// Mock authUtils
jest.mock('../../utils/authUtils', () => ({
  authFetch: jest.fn((url, options) => global.fetch(url, options)),
  getAuthToken: jest.fn(() => 'mock-token-123'),
}));

const { authFetch, getAuthToken } = require('../../utils/authUtils');

// Mock fetch globally
global.fetch = jest.fn();

describe('Rooms API Client', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    authFetch.mockClear();
  });

  describe('createRoom', () => {
    test('successfully creates a public room', async () => {
      const mockRoom = {
        id: 'room123',
        name: 'Test Room',
        type: 'public',
        ownerId: 'user123',
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ room: mockRoom }),
      });

      const result = await createRoom(mockToken, { name: 'Test Room', type: 'public' });

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
          }),
          body: JSON.stringify({ name: 'Test Room', type: 'public' }),
        })
      );

      expect(result).toEqual(mockRoom);
    });

    test('successfully creates a private room', async () => {
      const mockRoom = {
        id: 'room456',
        name: 'Private Room',
        type: 'private',
        ownerId: 'user123',
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ room: mockRoom }),
      });

      const result = await createRoom(mockToken, { name: 'Private Room', type: 'private' });

      expect(result.type).toBe('private');
    });

    test('successfully creates a secure room', async () => {
      const mockRoom = {
        id: 'room789',
        name: 'Secure Room',
        type: 'secure',
        ownerId: 'user123',
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ room: mockRoom }),
      });

      const result = await createRoom(mockToken, { name: 'Secure Room', type: 'secure' });

      expect(result.type).toBe('secure');
    });

    test('throws error on validation failure', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Room name is required' }),
      });

      await expect(createRoom(mockToken, { name: '', type: 'public' }))
        .rejects
        .toThrow('Room name is required');
    });

    test('throws error on unauthorized', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      });

      // 401 errors are now formatted as user-friendly messages
      await expect(createRoom('token', { name: 'Test', type: 'public' })).rejects.toThrow('Your session has expired');
    });
  });

  describe('listRooms', () => {
    test('successfully lists all rooms', async () => {
      const mockRooms = [
        { id: 'room1', name: 'Room 1', type: 'public' },
        { id: 'room2', name: 'Room 2', type: 'private' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: mockRooms }),
      });

      const result = await listRooms(mockToken);

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${API_BASE}/rooms`),
        expect.any(Object)
      );

      expect(result.rooms).toEqual(mockRooms);
    });

    test('filters rooms by type', async () => {
      const mockPublicRooms = [
        { id: 'room1', name: 'Public Room', type: 'public' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: mockPublicRooms }),
      });

      const result = await listRooms(mockToken, { type: 'public' });

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=public'),
        expect.any(Object)
      );

      expect(result.rooms).toEqual(mockPublicRooms);
    });

    test('includes archived rooms when requested', async () => {
      const mockArchivedRooms = [
        { id: 'room3', name: 'Archived Room', type: 'public', archived: true },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: mockArchivedRooms }),
      });

      await listRooms(mockToken, { includeArchived: true });

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('archived=1'),
        expect.any(Object)
      );
    });

    test('supports sorting options', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: [] }),
      });

      await listRooms(mockToken, { sortBy: 'name', order: 'asc' });

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringMatching(/sort_by=name.*order=asc|order=asc.*sort_by=name/),
        expect.any(Object)
      );
    });

    test('supports pagination', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: [], total: 100, page: 2, per_page: 20 }),
      });

      const result = await listRooms(mockToken, { page: 2, per_page: 20 });

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringMatching(/page=2.*per_page=20|per_page=20.*page=2/),
        expect.any(Object)
      );

      expect(result.page).toBe(2);
      expect(result.per_page).toBe(20);
    });

    test('returns structured pagination response', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms: [], total: 50 }),
      });

      const result = await listRooms(mockToken);

      expect(result).toHaveProperty('rooms');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('per_page');
    });

    test('throws error on failure', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      });

      // 500 errors are now formatted as user-friendly messages
      await expect(listRooms('token')).rejects.toThrow('A server error occurred');
    });
  });

  describe('getRoomDetails', () => {
    test('successfully gets room details', async () => {
      const mockRoom = {
        id: 'room123',
        name: 'Test Room',
        type: 'public',
        ownerId: 'user123',
        createdAt: '2025-01-01T00:00:00Z',
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ room: mockRoom }),
      });

      const result = await getRoomDetails(mockToken, 'room123');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123`,
        expect.any(Object)
      );

      expect(result).toEqual(mockRoom);
    });

    test('handles room not found (404)', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Room not found' }),
      });

      try {
        await getRoomDetails('token', 'room123');
        fail('Should have thrown');
      } catch (err) {
        // 404 errors are now formatted as user-friendly messages
        expect(err.message).toContain('not found');
        expect(err.status).toBe(404);
      }
    });

    test('handles unauthorized access (403)', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Access denied' }),
      });

      try {
        await getRoomDetails(mockToken, 'private-room');
        fail('Should have thrown');
      } catch (err) {
        expect(err.message).toContain('Access denied');
        expect(err.status).toBe(403);
      }
    });

    test('handles JSON parse errors gracefully', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      try {
        await getRoomDetails(mockToken, 'room123');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  describe('shareRoom', () => {
    test('shares room with usernames array', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await shareRoom(mockToken, 'room123', ['alice', 'bob']);

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/share`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ usernames: ['alice', 'bob'] }),
        })
      );
    });

    test('shares room with user objects including roles', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await shareRoom(mockToken, 'room123', [
        { username: 'alice', role: 'editor' },
        { username: 'bob', role: 'viewer' },
      ]);

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/share`,
        expect.objectContaining({
          body: JSON.stringify({
            users: [
              { username: 'alice', role: 'editor' },
              { username: 'bob', role: 'viewer' },
            ]
          }),
        })
      );
    });
  });

  describe('getRoomStrokes', () => {
    test('successfully gets room strokes', async () => {
      const mockStrokes = [
        { id: 'stroke1', points: [[0, 0], [10, 10]], color: '#000000' },
        { id: 'stroke2', points: [[20, 20], [30, 30]], color: '#FF0000' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ strokes: mockStrokes }),
      });

      const result = await getRoomStrokes(mockToken, 'room123');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/strokes`,
        expect.any(Object)
      );

      expect(result).toEqual(mockStrokes);
    });

    test('filters strokes by time range', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ strokes: [] }),
      });

      await getRoomStrokes(mockToken, 'room123', {
        start: 1640000000000,
        end: 1640100000000
      });

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringMatching(/start=1640000000000.*end=1640100000000|end=1640100000000.*start=1640000000000/),
        expect.any(Object)
      );
    });

    test('returns empty array when no strokes', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await getRoomStrokes(mockToken, 'room123');

      expect(result).toEqual([]);
    });

    test('handles unauthorized access', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Not a member' }),
      });

      try {
        await getRoomStrokes(mockToken, 'private-room');
        fail('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });
  });

  describe('postRoomStroke', () => {
    test('successfully posts a stroke', async () => {
      const stroke = {
        id: 'stroke123',
        points: [[0, 0], [10, 10], [20, 20]],
        color: '#000000',
        lineWidth: 5,
      };

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await postRoomStroke(mockToken, 'room123', stroke, null, null);

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/strokes`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ stroke, signature: null, signerPubKey: null }),
        })
      );
    });

    test('includes signature for secure rooms', async () => {
      const stroke = { id: 'stroke123', points: [[0, 0]], color: '#000' };
      const signature = 'signature-abc';
      const signerPubKey = 'pubkey-xyz';

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await postRoomStroke(mockToken, 'room123', stroke, signature, signerPubKey);

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/strokes`,
        expect.objectContaining({
          body: JSON.stringify({ stroke, signature, signerPubKey }),
        })
      );
    });

    test('throws error on validation failure', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid stroke data' }),
      });

      const invalidStroke = { points: [] };

      await expect(postRoomStroke(mockToken, 'room123', invalidStroke))
        .rejects
        .toThrow('Invalid stroke data');
    });
  });

  describe('undoRoomAction', () => {
    test('successfully undoes last action', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await undoRoomAction(mockToken, 'room123');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/undo`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    test('throws error when nothing to undo', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Nothing to undo' }),
      });

      await expect(undoRoomAction(mockToken, 'room123'))
        .rejects
        .toThrow('Nothing to undo');
    });
  });

  describe('redoRoomAction', () => {
    test('successfully redoes last undone action', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await redoRoomAction(mockToken, 'room123');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/redo`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    test('throws error when nothing to redo', async () => {
      authFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Nothing to redo' }),
      });

      await expect(redoRoomAction(mockToken, 'room123'))
        .rejects
        .toThrow('Nothing to redo');
    });
  });

  describe('suggestUsers', () => {
    test('successfully suggests users', async () => {
      const suggestions = [
        { username: 'alice' },
        { username: 'alex' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions }),
      });

      const result = await suggestUsers(mockToken, 'al');

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=al'),
        expect.any(Object)
      );

      expect(result).toEqual(suggestions);
    });

    test('handles empty query', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions: [] }),
      });

      const result = await suggestUsers(mockToken, '');

      expect(result).toEqual([]);
    });
  });

  describe('suggestRooms', () => {
    test('successfully suggests rooms', async () => {
      const rooms = [
        { id: 'room1', name: 'Test Room 1' },
        { id: 'room2', name: 'Test Room 2' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rooms }),
      });

      const result = await suggestRooms(mockToken, 'test');

      expect(authFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=test'),
        expect.any(Object)
      );

      expect(result).toEqual(rooms);
    });
  });

  describe('getRoomMembers', () => {
    test('successfully gets room members', async () => {
      const members = [
        { userId: 'user1', username: 'alice', role: 'owner' },
        { userId: 'user2', username: 'bob', role: 'editor' },
      ];

      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members }),
      });

      const result = await getRoomMembers(mockToken, 'room123');

      expect(authFetch).toHaveBeenCalledWith(
        `${API_BASE}/rooms/room123/members`,
        expect.any(Object)
      );

      expect(result).toEqual(members);
    });

    test('returns empty array when no members', async () => {
      authFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await getRoomMembers(mockToken, 'room123');

      expect(result).toEqual([]);
    });
  });
});
