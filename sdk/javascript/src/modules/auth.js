/**
 * Authentication module for ResCanvas SDK
 * 
 * Handles user registration, login, token refresh, and logout.
 */

class AuthClient {
  constructor(client) {
    this.client = client;
  }

  /**
   * Register a new user account
   * 
   * @param {Object} credentials - User credentials
   * @param {string} credentials.username - Username (3-128 chars, alphanumeric + _-.)
   * @param {string} credentials.password - Password (min 6 chars)
   * @param {string} [credentials.walletPubKey] - Optional wallet public key for secure rooms
   * @returns {Promise<{token: string, user: object}>} Access token and user object
   */
  async register({ username, password, walletPubKey }) {
    const response = await this.client._request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, walletPubKey })
    });

    // Automatically set token for future requests
    if (response.token) {
      this.client.setToken(response.token);
    }

    return response;
  }

  /**
   * Login with username and password
   * 
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.username - Username
   * @param {string} credentials.password - Password
   * @returns {Promise<{token: string, user: object}>} Access token and user object
   */
  async login({ username, password }) {
    const response = await this.client._request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    // Automatically set token for future requests
    if (response.token) {
      this.client.setToken(response.token);
    }

    return response;
  }

  /**
   * Refresh expired access token using refresh cookie
   * 
   * @returns {Promise<{token: string}>} New access token
   */
  async refresh() {
    const response = await this.client._request('/auth/refresh', {
      method: 'POST'
    });

    // Automatically set new token
    if (response.token) {
      this.client.setToken(response.token);
    }

    return response;
  }

  /**
   * Logout current user and invalidate refresh token
   * 
   * @returns {Promise<{status: string}>} Logout status
   */
  async logout() {
    const response = await this.client._request('/auth/logout', {
      method: 'POST'
    });

    // Clear stored token
    this.client.setToken(null);

    return response;
  }

  /**
   * Get information about currently authenticated user
   * 
   * @returns {Promise<{user: object}>} Current user information
   */
  async getMe() {
    return await this.client._request('/auth/me', {
      method: 'GET'
    });
  }

  /**
   * Change password for authenticated user
   * 
   * @param {string} newPassword - New password (min 6 chars)
   * @returns {Promise<{status: string}>} Change password status
   */
  async changePassword(newPassword) {
    return await this.client._request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ password: newPassword })
    });
  }

  /**
   * Search for users by username prefix
   * 
   * @param {string} query - Search query (username prefix)
   * @returns {Promise<{users: array}>} Matching users
   */
  async searchUsers(query) {
    return await this.client._request(`/users/search?q=${encodeURIComponent(query)}`, {
      method: 'GET'
    });
  }
}

export default AuthClient;
