// Runtime API base detection for the frontend.
// Priority:
// 1. REACT_APP_API_BASE environment variable (set at build/start time)
// 2. If running on localhost (or 127.0.0.1), assume backend is on same host at port 10010
// 3. Fallback to http://127.0.0.1:10010

const envBase = typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE;
function defaultLocalBase() {
  try {
    const loc = window && window.location;
    if (!loc) return 'http://127.0.0.1:10010';
    const hostname = loc.hostname;
    // If frontend served from localhost/127.0.0.1 use 127.0.0.1 for API to avoid IPv6/IPv4 mismatch
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return `${loc.protocol}//127.0.0.1:10010`;
    }
    // Otherwise use same origin but port 10010 (useful when proxied)
    return `${loc.protocol}//${hostname}:10010`;
  } catch (err) {
    return 'http://127.0.0.1:10010';
  }
}

export const API_BASE = envBase || defaultLocalBase();

export default {
  API_BASE
};
