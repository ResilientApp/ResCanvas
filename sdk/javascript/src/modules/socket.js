/**
 * Socket.IO module for ResCanvas SDK
 * 
 * Handles real-time collaboration via Socket.IO.
 */

import { io } from 'socket.io-client';

class SocketClient {
  constructor(client) {
    this.client = client;
    this.socket = null;
    this.connected = false;
    this.currentRooms = new Set();
  }

  /**
   * Connect to Socket.IO server
   * 
   * @param {string} token - JWT access token for authentication
   * @param {Object} [options={}] - Socket.IO connection options
   * @returns {Promise<void>} Resolves when connected
   */
  connect(token, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      const socketUrl = this.client.config.baseUrl;

      this.socket = io(socketUrl, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling'],
        ...options
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        this.connected = false;
        reject(error);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });
    });
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.currentRooms.clear();
    }
  }

  /**
   * Join a room for real-time collaboration
   * 
   * @param {string} roomId - Room ID to join
   */
  joinRoom(roomId) {
    if (!this.socket) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    this.socket.emit('join_room', { roomId });
    this.currentRooms.add(roomId);
  }

  /**
   * Leave a room
   * 
   * @param {string} roomId - Room ID to leave
   */
  leaveRoom(roomId) {
    if (!this.socket) {
      return;
    }

    this.socket.emit('leave_room', { roomId });
    this.currentRooms.delete(roomId);
  }

  /**
   * Listen for a Socket.IO event
   * 
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * 
   * @example
   * client.socket.on('new_line', (stroke) => {
   *   console.log('New stroke received:', stroke);
   * });
   */
  on(event, callback) {
    if (!this.socket) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    this.socket.on(event, callback);
  }

  /**
   * Remove event listener
   * 
   * @param {string} event - Event name
   * @param {Function} [callback] - Specific handler to remove (optional)
   */
  off(event, callback) {
    if (!this.socket) {
      return;
    }

    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  /**
   * Emit an event to the server
   * 
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (!this.socket) {
      throw new Error('Socket not connected. Call connect() first.');
    }

    this.socket.emit(event, data);
  }

  /**
   * Check if socket is currently connected
   * 
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  /**
   * Get list of currently joined rooms
   * 
   * @returns {Set<string>} Set of room IDs
   */
  getJoinedRooms() {
    return new Set(this.currentRooms);
  }
}

export default SocketClient;
