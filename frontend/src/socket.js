import { io } from "socket.io-client";
const WS_BASE = "http://localhost:10010";

let socket = null;
let listeners = new Set();
let currentToken = null;

function createSocket(token) {
  const s = io(WS_BASE, {
    transports: ["websocket"],
    auth: { token },
    query: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000
  });

  s.on("connect", () => {
    // ensure auth token is present on the socket auth for server-side checks
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

// Update the token to be used for future reconnects; re-auth the socket immediately.
export function setSocketToken(token) {
  currentToken = token || null;
  if (!socket) return;
  try {
    socket.auth = socket.auth || {};
    socket.auth.token = currentToken;
    // If socket is disconnected, attempt to connect; otherwise, force a reconnect to propagate auth
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
