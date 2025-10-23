/**
 * Rooms module for ResCanvas SDK
 * 
 * Handles room management, drawing operations, and collaboration features.
 */

class RoomsClient {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a new drawing room
   * 
   * @param {Object} roomData - Room configuration
   * @param {string} roomData.name - Room name (1-256 chars, required)
   * @param {string} roomData.type - Room type: "public", "private", or "secure" (required)
   * @param {string} [roomData.description] - Room description (max 500 chars)
   * @returns {Promise<{room: object}>} Created room object
   */
  async create({ name, type, description }) {
    return await this.client._request('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, type, description })
    });
  }

  /**
   * List rooms accessible to authenticated user
   * 
   * @param {Object} [options={}] - List options
   * @param {boolean} [options.includeArchived] - Include archived rooms
   * @param {string} [options.sortBy] - Sort field: "createdAt", "updatedAt", "name"
   * @param {string} [options.order] - Sort order: "asc" or "desc"
   * @param {number} [options.page] - Page number for pagination
   * @param {number} [options.per_page] - Items per page
   * @param {string} [options.type] - Filter by room type
   * @returns {Promise<{rooms: array, pagination: object}>} Rooms list with pagination
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    if (options.includeArchived) params.append('includeArchived', 'true');
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.order) params.append('order', options.order);
    if (options.page) params.append('page', options.page.toString());
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.type) params.append('type', options.type);

    const queryString = params.toString();
    const path = queryString ? `/rooms?${queryString}` : '/rooms';

    return await this.client._request(path, {
      method: 'GET'
    });
  }

  /**
   * Get details for a specific room
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{room: object}>} Room details
   */
  async get(roomId) {
    return await this.client._request(`/rooms/${roomId}`, {
      method: 'GET'
    });
  }

  /**
   * Update room settings
   * 
   * @param {string} roomId - Room ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.name] - New room name
   * @param {string} [updates.description] - New description
   * @param {boolean} [updates.archived] - Archive status
   * @returns {Promise<{room: object}>} Updated room object
   */
  async update(roomId, updates) {
    return await this.client._request(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * Delete a room (owner only)
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string}>} Deletion status
   */
  async delete(roomId) {
    return await this.client._request(`/rooms/${roomId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Share room with multiple users
   * 
   * @param {string} roomId - Room ID
   * @param {Array<{username: string, role: string}>} users - Users to share with
   * @returns {Promise<{status: string, results: array}>} Share results
   */
  async share(roomId, users) {
    return await this.client._request(`/rooms/${roomId}/share`, {
      method: 'POST',
      body: JSON.stringify({ users })
    });
  }

  /**
   * Get list of room members with their roles
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{members: array}>} Room members
   */
  async getMembers(roomId) {
    return await this.client._request(`/rooms/${roomId}/members`, {
      method: 'GET'
    });
  }

  /**
   * Update member permissions
   * 
   * @param {string} roomId - Room ID
   * @param {string} memberId - Member ID to update
   * @param {string} role - New role: "owner", "editor", or "viewer"
   * @returns {Promise<{status: string}>} Update status
   */
  async updatePermissions(roomId, memberId, role) {
    return await this.client._request(`/rooms/${roomId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ memberId, role })
    });
  }

  /**
   * Get drawing strokes for a room
   * 
   * @param {string} roomId - Room ID
   * @param {Object} [options={}] - Query options
   * @param {number} [options.since] - Get strokes after this timestamp
   * @param {number} [options.until] - Get strokes before this timestamp
   * @returns {Promise<{strokes: array}>} Room strokes
   */
  async getStrokes(roomId, options = {}) {
    const params = new URLSearchParams();
    if (options.since) params.append('since', options.since.toString());
    if (options.until) params.append('until', options.until.toString());

    const queryString = params.toString();
    const path = queryString ? `/rooms/${roomId}/strokes?${queryString}` : `/rooms/${roomId}/strokes`;

    return await this.client._request(path, {
      method: 'GET'
    });
  }

  /**
   * Submit a new drawing stroke to a room
   * 
   * @param {string} roomId - Room ID
   * @param {Object} stroke - Stroke data
   * @param {Array<{x: number, y: number}>} stroke.pathData - Array of points
   * @param {string} stroke.color - Stroke color (hex format, e.g., "#000000")
   * @param {number} stroke.lineWidth - Line width in pixels
   * @param {string} [stroke.user] - Username (optional, server can infer)
   * @param {string} [stroke.tool] - Drawing tool name
   * @param {string} [stroke.signature] - Signature for secure rooms
   * @param {string} [stroke.signerPubKey] - Signer public key for secure rooms
   * @returns {Promise<{status: string, stroke: object}>} Submission result
   */
  async addStroke(roomId, stroke) {
    return await this.client._request(`/rooms/${roomId}/strokes`, {
      method: 'POST',
      body: JSON.stringify(stroke)
    });
  }

  /**
   * Undo the last stroke submitted by current user
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string, undone: object}>} Undo result
   */
  async undo(roomId) {
    return await this.client._request(`/rooms/${roomId}/undo`, {
      method: 'POST'
    });
  }

  /**
   * Redo a previously undone stroke
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string, redone: object}>} Redo result
   */
  async redo(roomId) {
    return await this.client._request(`/rooms/${roomId}/redo`, {
      method: 'POST'
    });
  }

  /**
   * Clear all strokes from room canvas
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string, clearedAt: number}>} Clear result
   */
  async clear(roomId) {
    return await this.client._request(`/rooms/${roomId}/clear`, {
      method: 'POST'
    });
  }

  /**
   * Get undo/redo status for current user in room
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{canUndo: boolean, canRedo: boolean}>} Undo/redo availability
   */
  async getUndoRedoStatus(roomId) {
    return await this.client._request(`/rooms/${roomId}/undo-redo-status`, {
      method: 'GET'
    });
  }

  /**
   * Reset undo/redo stacks for current user
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string}>} Reset status
   */
  async resetStacks(roomId) {
    return await this.client._request(`/rooms/${roomId}/reset-stacks`, {
      method: 'POST'
    });
  }

  /**
   * Transfer room ownership to another user
   * 
   * @param {string} roomId - Room ID
   * @param {string} newOwnerId - New owner's user ID
   * @returns {Promise<{status: string}>} Transfer status
   */
  async transferOwnership(roomId, newOwnerId) {
    return await this.client._request(`/rooms/${roomId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId })
    });
  }

  /**
   * Leave a room (removes membership)
   * 
   * @param {string} roomId - Room ID
   * @returns {Promise<{status: string}>} Leave status
   */
  async leave(roomId) {
    return await this.client._request(`/rooms/${roomId}/leave`, {
      method: 'POST'
    });
  }

  /**
   * Invite a user to join a room
   * 
   * @param {string} roomId - Room ID
   * @param {string} username - Username to invite
   * @param {string} [role='editor'] - Role to assign: "owner", "editor", or "viewer"
   * @returns {Promise<{status: string, inviteId: string}>} Invitation result
   */
  async invite(roomId, username, role = 'editor') {
    return await this.client._request(`/rooms/${roomId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ username, role })
    });
  }

  /**
   * Search for rooms by name (autocomplete)
   * 
   * @param {string} query - Search query
   * @returns {Promise<{rooms: array}>} Matching rooms
   */
  async suggest(query) {
    return await this.client._request(`/rooms/suggest?q=${encodeURIComponent(query)}`, {
      method: 'GET'
    });
  }
}

export default RoomsClient;
