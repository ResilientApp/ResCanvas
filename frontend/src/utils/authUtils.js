// Utility functions for handling authentication errors

export const handleAuthError = (error) => {
  if (error.message === 'Unauthorized' || error.message?.includes('401')) {
    console.log('Authentication expired, redirecting to login');
    localStorage.removeItem('auth');
    window.location.href = '/login';
    return true; // Indicates auth error was handled
  }
  return false; // Not an auth error
};

export const withAuthErrorHandling = (asyncFn) => {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      if (!handleAuthError(error)) {
        throw error; // Re-throw if not an auth error
      }
    }
  };
};

export const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // Decode JWT without verification to check expiration
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Date.now() / 1000;
    return payload.exp > now;
  } catch {
    return false;
  }
};

// Wrapper for fetch with auth error handling
export const authFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    return response;
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};