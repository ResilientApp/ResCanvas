/**
 * Tests for Rooms Module
 */

const RoomsClient = require('../src/modules/rooms').default;

describe('RoomsClient', () => {
  let roomsClient;
  let mockRequest;

  beforeEach(() => {
    mockRequest = jest.fn();
    roomsClient = new RoomsClient({ _request: mockRequest });
  });

  describe('create', () => {
    it('should create a new room', async () => {
      const mockRoom = {
        room: { id: 'room1', name: 'Test Room', type: 'public' },
      };
      mockRequest.mockResolvedValue(mockRoom);

      const result = await roomsClient.create({
        name: 'Test Room',
        type: 'public',
      });

      expect(mockRequest).toHaveBeenCalledWith('/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Room', type: 'public' }),
      });
      expect(result).toEqual(mockRoom);
    });
  });

  describe('list', () => {
    it('should list all accessible rooms', async () => {
      const mockRooms = {
        rooms: [
          { id: 'room1', name: 'Room 1' },
          { id: 'room2', name: 'Room 2' },
        ],
      };
      mockRequest.mockResolvedValue(mockRooms);

      const result = await roomsClient.list();

      expect(mockRequest).toHaveBeenCalledWith('/rooms', { method: 'GET' });
      expect(result).toEqual(mockRooms);
    });
  });

  describe('get', () => {
    it('should get room details', async () => {
      const mockRoom = {
        room: { id: 'room1', name: 'Test Room', members: [] },
      };
      mockRequest.mockResolvedValue(mockRoom);

      const result = await roomsClient.get('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1', { method: 'GET' });
      expect(result).toEqual(mockRoom);
    });
  });

  describe('update', () => {
    it('should update room details', async () => {
      const mockRoom = {
        room: { id: 'room1', name: 'Updated Room' },
      };
      mockRequest.mockResolvedValue(mockRoom);

      const result = await roomsClient.update('room1', { name: 'Updated Room' });

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Room' }),
      });
      expect(result).toEqual(mockRoom);
    });
  });

  describe('delete', () => {
    it('should delete a room', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.delete('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1', { method: 'DELETE' });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('addStroke', () => {
    it('should add a stroke to room', async () => {
      const strokeData = {
        points: [[10, 20], [30, 40]],
        color: '#000000',
        width: 2,
      };
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.addStroke('room1', strokeData);

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/strokes', {
        method: 'POST',
        body: JSON.stringify(strokeData),
      });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('getStrokes', () => {
    it('should get all strokes from room', async () => {
      const mockStrokes = {
        strokes: [
          { id: 'stroke1', color: '#000000' },
          { id: 'stroke2', color: '#FF0000' },
        ],
      };
      mockRequest.mockResolvedValue(mockStrokes);

      const result = await roomsClient.getStrokes('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/strokes', { method: 'GET' });
      expect(result).toEqual(mockStrokes);
    });
  });

  describe('undo', () => {
    it('should undo last stroke', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.undo('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/undo', { method: 'POST' });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('redo', () => {
    it('should redo last undone stroke', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.redo('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/redo', { method: 'POST' });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('clear', () => {
    it('should clear entire canvas', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.clear('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/clear', { method: 'POST' });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('share', () => {
    it('should share room with users', async () => {
      const users = [
        { username: 'user1', role: 'editor' },
        { username: 'user2', role: 'viewer' },
      ];
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.share('room1', users);

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/share', {
        method: 'POST',
        body: JSON.stringify({ users }),
      });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('getMembers', () => {
    it('should get room members', async () => {
      const mockMembers = {
        members: [
          { username: 'owner', role: 'owner' },
          { username: 'editor1', role: 'editor' },
        ],
      };
      mockRequest.mockResolvedValue(mockMembers);

      const result = await roomsClient.getMembers('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/members', { method: 'GET' });
      expect(result).toEqual(mockMembers);
    });
  });

  describe('updatePermissions', () => {
    it('should update member permissions', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.updatePermissions('room1', 'user1', 'viewer');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/permissions', {
        method: 'PATCH',
        body: JSON.stringify({ memberId: 'user1', role: 'viewer' }),
      });
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('leave', () => {
    it('should leave a room', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await roomsClient.leave('room1');

      expect(mockRequest).toHaveBeenCalledWith('/rooms/room1/leave', { method: 'POST' });
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
