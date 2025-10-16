/**
 * Notifications module for ResCanvas SDK
 * 
 * Handles user notification management.
 */

class NotificationsClient {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all notifications for current user
   * 
   * @returns {Promise<{notifications: array}>} List of notifications
   */
  async list() {
    return await this.client._request('/notifications', {
      method: 'GET'
    });
  }

  /**
   * Mark a notification as read
   * 
   * @param {string} notificationId - Notification ID
   * @returns {Promise<{status: string}>} Mark read status
   */
  async markRead(notificationId) {
    return await this.client._request(`/notifications/${notificationId}/mark-read`, {
      method: 'POST'
    });
  }

  /**
   * Delete a specific notification
   * 
   * @param {string} notificationId - Notification ID
   * @returns {Promise<{status: string}>} Deletion status
   */
  async delete(notificationId) {
    return await this.client._request(`/notifications/${notificationId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Delete all notifications for current user
   * 
   * @returns {Promise<{status: string}>} Clear status
   */
  async clear() {
    return await this.client._request('/notifications', {
      method: 'DELETE'
    });
  }

  /**
   * Get notification preferences for current user
   * 
   * @returns {Promise<{preferences: object}>} Notification preferences
   */
  async getPreferences() {
    return await this.client._request('/notifications/preferences', {
      method: 'GET'
    });
  }

  /**
   * Update notification preferences
   * 
   * @param {Object} preferences - Notification preferences to update
   * @param {boolean} [preferences.roomInvites] - Receive room invitation notifications
   * @param {boolean} [preferences.mentions] - Receive mention notifications
   * @param {boolean} [preferences.roomActivity] - Receive room activity notifications
   * @returns {Promise<{status: string, preferences: object}>} Update result
   */
  async updatePreferences(preferences) {
    return await this.client._request('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences)
    });
  }
}

export default NotificationsClient;
