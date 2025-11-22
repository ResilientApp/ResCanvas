import { io } from "socket.io-client";
import { API_BASE } from '../config/apiConfig';

function deriveWsBase(apiBase) {
  try {
    if (apiBase && typeof apiBase === 'string') {
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
  // Return existing socket if token hasn't changed and socket is connected
  if (socket && token === currentToken && socket.connected) {
    return socket;
  }

  // Token changed or no socket exists - recreate
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
