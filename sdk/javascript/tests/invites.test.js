/**
 * Tests for Invites Module
 */

const InvitesClient = require('../src/modules/invites').default;

describe('InvitesClient', () => {
  let invitesClient;
  let mockRequest;

  beforeEach(() => {
    mockRequest = jest.fn();
    invitesClient = new InvitesClient({ _request: mockRequest });
  });

  describe('list', () => {
    it('should list all pending invitations', async () => {
      const mockInvites = {
        invites: [
          { id: 'inv1', roomId: 'room1', roomName: 'Test Room', role: 'editor' },
          { id: 'inv2', roomId: 'room2', roomName: 'Another Room', role: 'viewer' },
        ],
      };
      mockRequest.mockResolvedValue(mockInvites);

      const result = await invitesClient.list();

      expect(mockRequest).toHaveBeenCalledWith('/invites', { method: 'GET' });
      expect(result).toEqual(mockInvites);
    });

    it('should return empty list when no invites', async () => {
      mockRequest.mockResolvedValue({ invites: [] });

      const result = await invitesClient.list();

      expect(result.invites).toEqual([]);
    });
  });

  describe('accept', () => {
    it('should accept an invitation successfully', async () => {
      mockRequest.mockResolvedValue({ status: 'ok', message: 'Invitation accepted' });

      const result = await invitesClient.accept('inv1');

      expect(mockRequest).toHaveBeenCalledWith('/invites/inv1/accept', { method: 'POST' });
      expect(result.status).toBe('ok');
    });

    it('should handle invalid invitation ID', async () => {
      mockRequest.mockRejectedValue(new Error('Invitation not found'));

      await expect(invitesClient.accept('invalid-id')).rejects.toThrow(
        'Invitation not found'
      );
    });
  });

  describe('decline', () => {
    it('should decline an invitation successfully', async () => {
      mockRequest.mockResolvedValue({ status: 'ok', message: 'Invitation declined' });

      const result = await invitesClient.decline('inv1');

      expect(mockRequest).toHaveBeenCalledWith('/invites/inv1/decline', { method: 'POST' });
      expect(result.status).toBe('ok');
    });

    it('should handle already accepted invitation', async () => {
      mockRequest.mockRejectedValue(new Error('Invitation already accepted'));

      await expect(invitesClient.decline('inv1')).rejects.toThrow(
        'Invitation already accepted'
      );
    });
  });
});
