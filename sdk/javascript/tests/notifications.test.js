/**
 * Tests for Notifications Module
 */

const NotificationsClient = require('../src/modules/notifications').default;

describe('NotificationsClient', () => {
  let notificationsClient;
  let mockRequest;

  beforeEach(() => {
    mockRequest = jest.fn();
    notificationsClient = new NotificationsClient({ _request: mockRequest });
  });

  describe('list', () => {
    it('should list all notifications', async () => {
      const mockNotifications = {
        notifications: [
          { id: 'not1', message: 'You were added to a room', read: false },
          { id: 'not2', message: 'New stroke in your room', read: true },
        ],
      };
      mockRequest.mockResolvedValue(mockNotifications);

      const result = await notificationsClient.list();

      expect(mockRequest).toHaveBeenCalledWith('/notifications', { method: 'GET' });
      expect(result).toEqual(mockNotifications);
    });

    it('should return empty list when no notifications', async () => {
      mockRequest.mockResolvedValue({ notifications: [] });

      const result = await notificationsClient.list();

      expect(result.notifications).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await notificationsClient.markRead('not1');

      expect(mockRequest).toHaveBeenCalledWith('/notifications/not1/mark-read', { method: 'POST' });
      expect(result.status).toBe('ok');
    });

    it('should handle invalid notification ID', async () => {
      mockRequest.mockRejectedValue(new Error('Notification not found'));

      await expect(notificationsClient.markRead('invalid-id')).rejects.toThrow(
        'Notification not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete a notification', async () => {
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await notificationsClient.delete('not1');

      expect(mockRequest).toHaveBeenCalledWith('/notifications/not1', { method: 'DELETE' });
      expect(result.status).toBe('ok');
    });

    it('should handle already deleted notification', async () => {
      mockRequest.mockRejectedValue(new Error('Notification not found'));

      await expect(notificationsClient.delete('invalid-id')).rejects.toThrow(
        'Notification not found'
      );
    });
  });

  describe('clear', () => {
    it('should clear all notifications', async () => {
      mockRequest.mockResolvedValue({ status: 'ok', message: 'All notifications cleared' });

      const result = await notificationsClient.clear();

      expect(mockRequest).toHaveBeenCalledWith('/notifications', { method: 'DELETE' });
      expect(result.status).toBe('ok');
    });
  });

  describe('getPreferences', () => {
    it('should get notification preferences', async () => {
      const mockPreferences = {
        emailNotifications: true,
        pushNotifications: false,
        soundEnabled: true,
      };
      mockRequest.mockResolvedValue(mockPreferences);

      const result = await notificationsClient.getPreferences();

      expect(mockRequest).toHaveBeenCalledWith('/notifications/preferences', { method: 'GET' });
      expect(result).toEqual(mockPreferences);
    });
  });

  describe('updatePreferences', () => {
    it('should update notification preferences', async () => {
      const newPreferences = {
        emailNotifications: false,
        pushNotifications: true,
      };
      mockRequest.mockResolvedValue({ status: 'ok' });

      const result = await notificationsClient.updatePreferences(newPreferences);

      expect(mockRequest).toHaveBeenCalledWith('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(newPreferences),
      });
      expect(result.status).toBe('ok');
    });

    it('should handle invalid preferences format', async () => {
      mockRequest.mockRejectedValue(new Error('Invalid preferences format'));

      await expect(
        notificationsClient.updatePreferences({ invalidField: true })
      ).rejects.toThrow('Invalid preferences format');
    });
  });
});
