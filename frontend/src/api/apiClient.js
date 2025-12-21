// frontend/src/api/apiClient.js
/**
 * Enhanced API Client with Rate Limit Handling
 * 
 * This wrapper provides:
 * - Automatic rate limit detection and retry
 * - Request queueing during rate limits
 * - Rate limit monitoring and warnings
 * - Consistent error handling
 */

import {
  rateLimitAwareFetch,
  parseRateLimitInfo,
  formatRateLimitMessage,
  isRateLimitError,
  showRateLimitNotification,
  globalRateLimitMonitor,
} from '../utils/rateLimitHandler';

// Fallback to backend default (used in local development) when REACT_APP_API_BASE
// is not provided. This prevents malformed requests like "undefined/api/..."
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:10010';

console.log("API Base URL", API_BASE)

/**
 * Get auth token from localStorage
 */
function getAuthToken() {
  return localStorage.getItem('token');
}

/**
 * Build headers for API request
 */
function buildHeaders(customHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Handle API response
 */
async function handleResponse(response) {
  // Monitor rate limit headers
  globalRateLimitMonitor.checkResponse(response, response.url, (info) => {
    console.warn('Approaching rate limit:', info);
    // You can add a toast notification here
  });

  if (!response.ok) {
    if (response.status === 429) {
      const error = new Error('Rate limit exceeded');
      error.response = response;
      error.rateLimitInfo = parseRateLimitInfo(response);
      throw error;
    }

    // Try to parse error message from JSON
    try {
      const errorData = await response.json();
      const error = new Error(errorData.message || 'API request failed');
      error.status = response.status;
      error.data = errorData;
      throw error;
    } catch (parseError) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
  }

  return await response.json();
}

/**
 * Make API request with rate limit handling
 */
async function apiRequest(endpoint, options = {}, retryOptions = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = buildHeaders(options.headers);

  const fetchOptions = {
    ...options,
    headers,
  };

  try {
    const response = await rateLimitAwareFetch(url, fetchOptions, {
      maxAttempts: retryOptions.maxAttempts || 3,
      onRetry: (attempt, delay, rateLimitInfo) => {
        console.log(`Rate limited. Retrying attempt ${attempt} after ${delay}ms`);
        // You can add a toast notification here
      },
    });

    return await handleResponse(response);
  } catch (error) {
    if (isRateLimitError(error)) {
      // Show user-friendly rate limit message
      const message = formatRateLimitMessage(error);
      console.error('Rate limit exceeded:', message);
      // You can add a toast notification here
    }
    throw error;
  }
}

/**
 * API Client object with all methods
 */
const apiClient = {
  // GET request
  get: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      method: 'GET',
      ...options,
    });
  },

  // POST request
  post: (endpoint, data, options = {}) => {
    return apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    });
  },

  // PUT request
  put: (endpoint, data, options = {}) => {
    return apiRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options,
    });
  },

  // PATCH request
  patch: (endpoint, data, options = {}) => {
    return apiRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
      ...options,
    });
  },

  // DELETE request
  delete: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      method: 'DELETE',
      ...options,
    });
  },
};

export default apiClient;

/**
 * Example Usage:
 * 
 * import apiClient from './api/apiClient';
 * 
 * // Simple GET request
 * const rooms = await apiClient.get('/rooms');
 * 
 * // POST with data
 * const newRoom = await apiClient.post('/rooms', {
 *   name: 'My Room',
 *   type: 'public'
 * });
 * 
 * // Handle errors
 * try {
 *   await apiClient.post('/rooms/<id>/strokes', strokeData);
 * } catch (error) {
 *   if (error.status === 429) {
 *     // Rate limited - already handled automatically
 *     console.log('Rate limited, but will retry automatically');
 *   } else {
 *     console.error('API error:', error.message);
 *   }
 * }
 */
