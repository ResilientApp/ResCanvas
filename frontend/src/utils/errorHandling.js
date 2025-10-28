
export function formatErrorMessage(error) {
  if (!error) return 'An unknown error occurred';

  if (typeof error === 'string') return error;

  let message = error.message || 'An error occurred';

  try {
    if (error.body && error.body.errors) {
      const errors = error.body.errors;
      if (typeof errors === 'object' && Object.keys(errors).length > 0) {
        const errorMessages = Object.entries(errors)
          .map(([field, msg]) => {
            const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
            return `${fieldName}: ${msg}`;
          });
        return errorMessages.join('\n');
      }
    }

    if (error.body && error.body.message) {
      message = error.body.message;
    }

    if (error.status) {
      switch (error.status) {
        case 400:
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
          return message;        case 500:
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
    console.warn('Error parsing error response:', parseError);
  }

  return message;
}

export class ApiError extends Error {
  constructor(response, body) {
    const message = formatErrorMessage({ body, status: response?.status });
    super(message);
    this.name = 'ApiError';
    this.status = response?.status;
    this.body = body;
    this.response = response;
  }

  getUserMessage() {
    return formatErrorMessage(this);
  }

  isAuthError() {
    return this.status === 401;
  }

  isAuthzError() {
    return this.status === 403;
  }

  isValidationError() {
    return this.status === 400;
  }

  getValidationErrors() {
    if (this.body && this.body.errors && typeof this.body.errors === 'object') {
      return this.body.errors;
    }
    return {};
  }
}

export async function handleApiResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (parseError) {
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

export const clientValidation = {
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

  password: (value) => {
    if (!value || typeof value !== 'string') {
      return 'Password is required';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    try {
      const byteLength = new TextEncoder().encode(value).length;
      if (byteLength > 72) {
        return 'Password is too long (maximum 72 bytes)';
      }
    } catch (e) {
    }
    return null;
  },

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

  roomType: (value) => {
    const validTypes = ['public', 'private', 'secure'];
    if (!value || !validTypes.includes(value)) {
      return `Room type must be one of: ${validTypes.join(', ')}`;
    }
    return null;
  }
};

export function notifyError(message, duration = 6000) {
  try {
    window.dispatchEvent(new CustomEvent('rescanvas:notify', {
      detail: { message, duration, severity: 'error' }
    }));
  } catch (error) {
    console.error('Failed to dispatch error notification:', error);
    console.error(message);
  }
}

export function notifySuccess(message, duration = 4000) {
  try {
    window.dispatchEvent(new CustomEvent('rescanvas:notify', {
      detail: { message, duration, severity: 'success' }
    }));
  } catch (error) {
    console.error('Failed to dispatch success notification:', error);
  }
}

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
