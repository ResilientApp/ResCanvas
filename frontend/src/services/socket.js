import { io } from "socket.io-client";
import { API_BASE } from '../config/apiConfig';

// Derive WebSocket base from API_BASE (http -> ws, https -> wss).
// Be defensive: API_BASE may be undefined or a relative path in some dev setups.
function deriveWsBase(apiBase) {
  try {
    if (apiBase && typeof apiBase === 'string') {
      // If apiBase starts with http/https, swap to ws/wss.
      if (apiBase.startsWith('http://')) return apiBase.replace(/^http:/, 'ws:');
      if (apiBase.startsWith('https://')) return apiBase.replace(/^https:/, 'wss:');
      const loc = window && window.location;
      if (loc) {
        return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}${apiBase}`;
      }
      return apiBase;
    }
  } catch (e) { }
  try { const loc = window && window.location; return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.hostname}:10010`; } catch (e) { return 'ws://127.0.0.1:10010'; }
}

const WS_BASE = deriveWsBase(API_BASE);

let socket = null;
let listeners = new Set();
let currentToken = null;

function createSocket(token) {
  const s = io(WS_BASE, {
    auth: (token ? { token } : {}),
    query: (token ? { token } : {}),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000
  });

  s.on("connect", () => {
    try { s.auth = s.auth || {}; s.auth.token = currentToken; } catch (e) { }
  });

  s.on("connected", (msg) => {
    // console.debug("WS connected", msg);
  });

  s.on("notification", (n) => {
    listeners.forEach(fn => { try { fn(n); } catch (_) { } });
  });

  // bubble through by default; consumers attach their own listeners
  s.on("stroke", () => { });

  s.on("connect_error", (err) => {
    // Common cause: expired token; consumers' authRefresh should handle re-login.
    console.warn('Socket connect_error', err?.message || err);
  });

  return s;
}

export function getSocket(token) {
  // If token changed since last creation, tear down existing socket and create a fresh one
  if (socket && token && token === currentToken) return socket;
  try {
    if (socket) {
      try { socket.removeAllListeners(); socket.disconnect(); } catch (e) { }
      socket = null;
    }
  } catch (e) { }
  currentToken = token || null;
  socket = createSocket(currentToken);
  return socket;
}

export function setSocketToken(token) {
  currentToken = token || null;
  if (!socket) return;
  try {
    socket.auth = socket.auth || {};
    socket.auth.token = currentToken;
    if (socket.connected) {
      socket.disconnect();
      // small delay before reconnect to allow engine to clean up
      setTimeout(() => {
        try { socket.connect(); } catch (e) { }
      }, 50);
    } else {
      try { socket.connect(); } catch (e) { }
    }
  } catch (e) {
    console.error('Failed to set socket token', e);
  }
}

export function onNotification(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
