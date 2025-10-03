// Utility functions for handling authentication errors

const API_BASE = "http://localhost:10010";

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
export const getAuthToken = () => {
  try {
    const raw = localStorage.getItem('auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
};

export const setAuthToken = (token, user) => {
  if (!token) return;
  const nxt = { token, user };
  localStorage.setItem('auth', JSON.stringify(nxt));
};

// authFetch: tries the request, if 401 then attempts a one-time refresh using the cookie-based endpoint
export const authFetch = async (url, options = {}) => {
  const opts = { ...options };
  try {
    // Inject Authorization header from stored token if present and not already provided
    try {
      const tk = getAuthToken();
      if (tk) {
        opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${tk}` };
      }
    } catch (e) {
      // ignore
    }

    let response = await fetch(url, opts);
    if (response.status !== 401) return response;

    // Attempt a single refresh using refresh endpoint (includes cookies)
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      const jr = await refreshRes.json();
      if (refreshRes.ok && jr.token) {
        // Save new access token
        const raw = localStorage.getItem('auth');
        const user = raw ? JSON.parse(raw).user : null;
        setAuthToken(jr.token, user);
        // Retry original request (inject Authorization header if needed)
        const newOpts = { ...opts };
        newOpts.headers = { ...(newOpts.headers || {}), Authorization: `Bearer ${jr.token}` };
        response = await fetch(url, newOpts);
        if (response.status === 401) throw new Error('Unauthorized');
        return response;
      }
    } catch (refreshErr) {
      // fall through to auth error handling below
      console.warn('Token refresh failed or not available:', refreshErr?.message || refreshErr);
    }

    throw new Error('Unauthorized');
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
};