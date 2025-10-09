// Runtime API base detection for the frontend.
// Priority order: REACT_APP_API_BASE env var, then localhost heuristic, then fallback.

const envBase = typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE;
function defaultLocalBase() {
  try {
    const loc = window && window.location;
    if (!loc) return 'http://127.0.0.1:10010';
    const hostname = loc.hostname;
    // Use the same hostname as the frontend and just switch the port to 10010.
    // This avoids cross-origin cookie issues when the frontend is served from
    // `localhost` (or another host) and the backend was previously forced to
    // use `127.0.0.1`. Keeping hostname consistent ensures the browser will
    // send httpOnly refresh cookies on XHR requests to the refresh endpoint.
    return `${loc.protocol}//${hostname}:10010`;
  } catch (err) {
    return 'http://127.0.0.1:10010';
  }
}

export const API_BASE = envBase || defaultLocalBase();

export default {
  API_BASE
};
