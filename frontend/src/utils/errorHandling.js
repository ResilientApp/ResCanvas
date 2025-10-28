/**
 * Centralized error handling utilities for ResCanvas frontend
 * 
 * Provides consistent error parsing, formatting, and user-friendly message generation
 * from backend API responses.
 */

/**
 * Extract and format user-friendly error message from API error
 * 
 * @param {Error|Object} error - Error object or response
 * @returns {string} - User-friendly error message
 */
export function formatErrorMessage(error) {
  if (!error) return 'An unknown error occurred';

  // Handle string errors
  if (typeof error === 'string') return error;

  // Try to extract message from various error formats
  let message = error.message || 'An error occurred';

  // Check for structured validation errors from backend
  try {
    if (error.body && error.body.errors) {
      // Backend validation errors format: { errors: { field: "message", ... } }
      const errors = error.body.errors;
      if (typeof errors === 'object' && Object.keys(errors).length > 0) {
        const errorMessages = Object.entries(errors)
          .map(([field, msg]) => {
            // Capitalize field name for display
            const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
            return `${fieldName}: ${msg}`;
          });
        return errorMessages.join('\n');
      }
    }

    // Check for single message from backend
    if (error.body && error.body.message) {
      message = error.body.message;
    }

    // Handle specific HTTP status codes with friendly messages
    if (error.status) {
      switch (error.status) {
        case 400:
          // Bad Request - validation failed
          if (message.toLowerCase().includes('validation')) {
            return message;
          }
          return `Invalid input: ${message}`;
        case 401:
          return 'Invalid username or password. Please log in again.';
        case 403:
          return 'You do not have permission to perform this action.';
        case 404:
          return 'The requested resource was not found.';
        case 409:
          return message; // Conflict (e.g., username taken) - use specific message
        case 500:
          return 'A server error occurred. Please try again later.';
        case 502:
        case 503:
        case 504:
          return 'The server is temporarily unavailable. Please try again later.';
        default:
          return message;
      }
    }
  } catch (parseError) {
    // If parsing fails, return the original message
    console.warn('Error parsing error response:', parseError);
  }

  return message;
}

/**
 * Enhanced API error class with better error information extraction
 */
export class ApiError extends Error {
  constructor(response, body) {
    const message = formatErrorMessage({ body, status: response?.status });
    super(message);
    this.name = 'ApiError';
    this.status = response?.status;
    this.body = body;
    this.response = response;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage() {
    return formatErrorMessage(this);
  }

  /**
   * Check if error is an authentication error
   */
  isAuthError() {
    return this.status === 401;
  }

  /**
   * Check if error is an authorization error
   */
  isAuthzError() {
    return this.status === 403;
  }

  /**
   * Check if error is a validation error
   */
  isValidationError() {
    return this.status === 400;
  }

  /**
   * Get validation errors as field -> message map
   */
  getValidationErrors() {
    if (this.body && this.body.errors && typeof this.body.errors === 'object') {
      return this.body.errors;
    }
    return {};
  }
}

/**
 * Parse fetch response and throw ApiError if not ok
 * 
 * @param {Response} response - Fetch API response
 * @returns {Promise<Object>} - Parsed JSON body
 * @throws {ApiError} - If response is not ok
 */
export async function handleApiResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (parseError) {
    // If JSON parsing fails, try to get text
    try {
      const text = await response.text();
      body = { message: text || 'Unable to parse server response' };
    } catch (textError) {
      body = { message: 'Server response could not be read' };
    }
  }

  if (!response.ok) {
    throw new ApiError(response, body);
  }

  return body;
}

/**
 * Validate input on client side before sending to server
 * This provides immediate feedback but server-side validation is still authoritative
 */
export const clientValidation = {
  /**
   * Validate username format (mirrors backend validation)
   */
  username: (value) => {
    if (!value || typeof value !== 'string') {
      return 'Username is required';
    }
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (trimmed.length > 128) {
      return 'Username must be at most 128 characters';
    }
    if (!/^[A-Za-z0-9_\-\.]+$/.test(trimmed)) {
      return 'Username can only contain letters, numbers, underscore, hyphen, and dot';
    }
    return null;
  },

  /**
   * Validate password format (mirrors backend validation)
   */
  password: (value) => {
    if (!value || typeof value !== 'string') {
      return 'Password is required';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    // Check byte length for bcrypt limit
    try {
      const byteLength = new TextEncoder().encode(value).length;
      if (byteLength > 72) {
        return 'Password is too long (maximum 72 bytes)';
      }
    } catch (e) {
      // Ignore encoding errors
    }
    return null;
  },

  /**
   * Validate room name (mirrors backend validation)
   */
  roomName: (value) => {
    if (!value || typeof value !== 'string') {
      return 'Room name is required';
    }
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      return 'Room name is required';
    }
    if (trimmed.length > 256) {
      return 'Room name must be at most 256 characters';
    }
    return null;
  },

  /**
   * Validate room type (mirrors backend validation)
   */
  roomType: (value) => {
    const validTypes = ['public', 'private', 'secure'];
    if (!value || !validTypes.includes(value)) {
      return `Room type must be one of: ${validTypes.join(', ')}`;
    }
    return null;
  }
};

/**
 * Display error notification to user
 * Uses the ResCanvas custom event system for notifications
 * 
 * @param {string} message - Error message to display
 * @param {number} duration - Duration in milliseconds (default: 6000)
 */
export function notifyError(message, duration = 6000) {
  try {
    window.dispatchEvent(new CustomEvent('rescanvas:notify', {
      detail: { message, duration, severity: 'error' }
    }));
  } catch (error) {
    console.error('Failed to dispatch error notification:', error);
    // Fallback to console if notification system fails
    console.error(message);
  }
}

/**
 * Display success notification to user
 * 
 * @param {string} message - Success message to display
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export function notifySuccess(message, duration = 4000) {
  try {
    window.dispatchEvent(new CustomEvent('rescanvas:notify', {
      detail: { message, duration, severity: 'success' }
    }));
  } catch (error) {
    console.error('Failed to dispatch success notification:', error);
  }
}

/**
 * Wrapper for async operations with automatic error handling
 * 
 * @param {Function} asyncFn - Async function to wrap
 * @param {Object} options - Options for error handling
 * @param {boolean} options.showNotification - Whether to show error notification (default: true)
 * @param {Function} options.onError - Custom error handler
 * @returns {Function} - Wrapped async function
 */
export function withErrorHandling(asyncFn, options = {}) {
  const { showNotification = true, onError } = options;

  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      const message = formatErrorMessage(error);

      if (showNotification) {
        notifyError(message);
      }

      if (onError) {
        onError(error, message);
      }

      throw error;
    }
  };
}
