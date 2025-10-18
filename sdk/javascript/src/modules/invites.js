/**
 * Invitations module for ResCanvas SDK
 * 
 * Handles room invitation management.
 */

class InvitesClient {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all pending invitations for current user
   * 
   * @returns {Promise<{invites: array}>} List of invitations
   */
  async list() {
    return await this.client._request('/invites', {
      method: 'GET'
    });
  }

  /**
   * Accept a room invitation
   * 
   * @param {string} inviteId - Invitation ID
   * @returns {Promise<{status: string, room: object}>} Acceptance result with room details
   */
  async accept(inviteId) {
    return await this.client._request(`/invites/${inviteId}/accept`, {
      method: 'POST'
    });
  }

  /**
   * Decline a room invitation
   * 
   * @param {string} inviteId - Invitation ID
   * @returns {Promise<{status: string}>} Decline status
   */
  async decline(inviteId) {
    return await this.client._request(`/invites/${inviteId}/decline`, {
      method: 'POST'
    });
  }
}

export default InvitesClient;
