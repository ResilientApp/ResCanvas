import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';

const withTK = (headers = {}) => {
  const tk = getAuthToken();
  return { ...(headers || {}), ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
};

export async function createRoom(token, { name, type }) {
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const r = await authFetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, type })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "create room failed");
  return j.room;
}

export async function listRooms(token, includeArchived = false) {
  const url = `${API_BASE}/rooms${includeArchived ? '?archived=1' : ''}`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'list rooms failed');
  return j.rooms || [];
}

export async function shareRoom(token, roomId, usernamesOrObjects) {
  // usernamesOrObjects can be either ["alice"] or [{ username: "alice", role: "editor" }]
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  let payload;
  if (Array.isArray(usernamesOrObjects) && usernamesOrObjects.length > 0 && typeof usernamesOrObjects[0] === 'object') {
    // send array of objects
    payload = { users: usernamesOrObjects };
  } else {
    payload = { usernames: usernamesOrObjects };
  }
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/share`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  return await r.json();
}

export async function suggestUsers(token, q) {
  const url = `${API_BASE}/users/suggest?q=${encodeURIComponent(q || '')}`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'suggest users failed');
  return j.suggestions || [];
}

export async function suggestRooms(token, q) {
  const url = `${API_BASE}/rooms/suggest?q=${encodeURIComponent(q || '')}`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'suggest rooms failed');
  return j.rooms || [];
}

export async function getRoomMembers(token, roomId) {
  const url = `${API_BASE}/rooms/${roomId}/members`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'get members failed');
  return j.members || [];
}

export async function getRoomDetails(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { headers: withTK() });
  let j = {};
  try { j = await r.json(); } catch (e) { /* ignore parse errors */ }
  if (!r.ok) {
    const err = new Error(j.message || "get room failed");
    err.status = r.status;
    throw err;
  }
  return j.room || j;
}

export async function getRoomStrokes(token, roomId, start = undefined, end = undefined) {
  // helpers for legacy payload parsing
  const deepParse = (maybe) => {
    let cur = maybe;
    let depth = 0;
    while (depth < 5) {
      if (cur == null) return null;
      if (typeof cur === 'string') {
        try { cur = JSON.parse(cur); depth++; continue; } catch (e) { return cur; }
      }
      if (typeof cur === 'object') {
        if (cur.value && (typeof cur.value === 'string' || typeof cur.value === 'object')) { cur = cur.value; depth++; continue; }
        return cur;
      }
      return cur;
    }
    return cur;
  };

  const normalizeUser = (itUser, parsed) => {
    const candidates = [itUser, parsed && parsed.user, parsed && parsed.username, parsed && parsed.owner];
    for (let c of candidates) {
      if (!c && c !== 0) continue;
      if (typeof c === 'object') { if (c.username) return String(c.username); if (c.user) return String(c.user); try { const s = JSON.stringify(c); if (s && s.length < 120) return s; } catch (e) { } continue; }
      if (typeof c === 'string') {
        if (c.length > 120) {
          try { const parsedCandidate = JSON.parse(c); if (parsedCandidate && (parsedCandidate.user || parsedCandidate.username)) return String(parsedCandidate.user || parsedCandidate.username); continue; } catch (e) { if (c.length <= 120) return c; continue; }
        }
        return c;
      }
      return String(c);
    }
    return '';
  };

  const normalizePath = (p) => {
    if (!p && p !== 0) return [];
    if (Array.isArray(p)) return p;
    if (typeof p === 'string') { try { const pp = JSON.parse(p); return normalizePath(pp); } catch (e) { return [] } }
    if (typeof p === 'object') {
      if (p.tool === 'shape' || p.type === 'shape' || p.type === 'paste' || p.type === 'image') return p;
      if (Array.isArray(p.path)) return p.path;
      if (Array.isArray(p.pathData)) return p.pathData;
      if (Array.isArray(p.points)) return p.points;
    }
    return [];
  };

  // If caller requested a history range, prefer the legacy history endpoint
  if ((start !== undefined && start !== null) || (end !== undefined && end !== null)) {
    const qs = `?roomId=${encodeURIComponent(roomId)}${start ? `&start=${encodeURIComponent(start)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`;
    const url = `${API_BASE}/getCanvasData${qs}`;
    const r = await authFetch(url, { headers: withTK() });
    let j = {};
    try { j = await r.json(); } catch (e) { j = {}; }
    if (!r.ok) {
      const err = new Error(j.message || 'getCanvasData failed'); err.status = r.status; throw err;
    }
    const items = j.data || [];
    const strokes = items.map(it => {
      let parsed = null;
      try { parsed = deepParse(it.value || null) || {}; } catch (e) { parsed = {}; }
      const payload = (parsed && parsed.stroke) ? parsed.stroke : parsed;
      const lowerType = (payload && payload.type) ? String(payload.type).toLowerCase() : '';
      if (lowerType.includes('undo') || lowerType.includes('redo') || lowerType.includes('marker')) return null;
      const rawTs = parsed && (parsed.ts || parsed.timestamp) || it.ts;
      let numericTs = null;
      if (rawTs !== undefined && rawTs !== null) { try { if (typeof rawTs === 'object' && rawTs.$numberLong) numericTs = parseInt(rawTs.$numberLong); else numericTs = parseInt(rawTs); } catch (e) { numericTs = null; } }
      if (numericTs && numericTs < 1e11) numericTs = numericTs * 1000;
      const user = normalizeUser(it.user, parsed);
      return {
        drawingId: parsed && (parsed.drawingId || parsed.id) || it.id || parsed && parsed.strokeId || parsed && parsed._id,
        id: (parsed && (parsed.id || parsed.drawingId)) || it.id || '',
        color: (parsed && (parsed.color || (parsed.stroke && parsed.stroke.color))) || '#000000',
        lineWidth: (parsed && (parsed.lineWidth || (parsed.stroke && parsed.stroke.lineWidth) || parsed.width)) || 5,
        pathData: normalizePath(parsed && (parsed.pathData || (parsed.stroke && parsed.stroke.pathData) || parsed.path || parsed.points || parsed.data)),
        timestamp: numericTs || it.ts || Date.now(),
        ts: numericTs || it.ts || parsed && parsed.timestamp,
        user,
        order: parsed && (parsed.order || parsed.ts || parsed.timestamp) || 0,
        roomId: it.roomId || (parsed && parsed.roomId) || roomId
      };
    }).filter(Boolean);
    return strokes;
  }

  // Default: call the room strokes endpoint and if empty fallback to legacy
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/strokes`, { headers: withTK() });
  let j = {};
  try { j = await r.json(); } catch (e) { j = {}; }
  if (!r.ok) { const err = new Error(j.message || 'get strokes failed'); err.status = r.status; throw err; }
  let strokes = j.strokes || [];

  if ((!strokes || strokes.length === 0)) {
    try {
      const qs = `?roomId=${encodeURIComponent(roomId)}`;
      const url = `${API_BASE}/getCanvasData${qs}`;
      const r2 = await authFetch(url, { headers: withTK() });
      let j2 = {};
      try { j2 = await r2.json(); } catch (e) { j2 = {}; }
      if (r2.ok && j2 && Array.isArray(j2.data)) {
        const items = j2.data || [];
        strokes = items.map(it => {
          let parsed = null;
          try { parsed = deepParse(it.value || null) || {}; } catch (e) { parsed = {}; }
          const payload = (parsed && parsed.stroke) ? parsed.stroke : parsed;
          const lowerType = (payload && payload.type) ? String(payload.type).toLowerCase() : '';
          if (lowerType.includes('undo') || lowerType.includes('redo') || lowerType.includes('marker')) return null;
          const rawTs = parsed && (parsed.ts || parsed.timestamp) || it.ts;
          let numericTs = null;
          if (rawTs !== undefined && rawTs !== null) { try { if (typeof rawTs === 'object' && rawTs.$numberLong) numericTs = parseInt(rawTs.$numberLong); else numericTs = parseInt(rawTs); } catch (e) { numericTs = null; } }
          if (numericTs && numericTs < 1e11) numericTs = numericTs * 1000;
          const user = normalizeUser(it.user, parsed);
          return {
            drawingId: parsed && (parsed.drawingId || parsed.id) || it.id || parsed && parsed.strokeId || parsed && parsed._id,
            id: (parsed && (parsed.id || parsed.drawingId)) || it.id || '',
            color: (parsed && (parsed.color || (parsed.stroke && parsed.stroke.color))) || '#000000',
            lineWidth: (parsed && (parsed.lineWidth || (parsed.stroke && parsed.stroke.lineWidth) || parsed.width)) || 5,
            pathData: normalizePath(parsed && (parsed.pathData || (parsed.stroke && parsed.stroke.pathData) || parsed.path || parsed.points || parsed.data)),
            timestamp: numericTs || it.ts || Date.now(),
            ts: numericTs || it.ts || parsed && parsed.timestamp,
            user,
            order: parsed && (parsed.order || parsed.ts || parsed.timestamp) || 0,
            roomId: it.roomId || (parsed && parsed.roomId) || roomId
          };
        }).filter(Boolean);
      }
    } catch (e) { /* ignore fallback failure */ }
  }

  return strokes;
}

export async function postRoomStroke(token, roomId, stroke, signature, signerPubKey) {
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/strokes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ stroke, signature, signerPubKey })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "post stroke failed");
  return j;
}

export async function undoRoomAction(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/undo`, {
    method: "POST",
    headers: withTK({ "Content-Type": "application/json" })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "undo failed");
  return j;
}

export async function redoRoomAction(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/redo`, {
    method: "POST",
    headers: withTK({ "Content-Type": "application/json" })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "redo failed");
  return j;
}

export async function getUndoRedoStatus(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/undo_redo_status`, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "get status failed");
  return j;
}

export async function listInvites(token) {
  const r = await authFetch(`${API_BASE}/invites`, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "list invites failed");
  return j.invites || [];
}

export async function getHiddenRooms(token) {
  const r = await authFetch(`${API_BASE}/users/hidden_rooms`, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'get hidden rooms failed');
  return j.hiddenRooms || [];
}

export async function addHiddenRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/users/hidden_rooms`, { method: 'POST', headers: withTK({ 'Content-Type': 'application/json' }), body: JSON.stringify({ roomId }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'add hidden room failed');
  return j;
}

export async function removeHiddenRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/users/hidden_rooms/${roomId}`, { method: 'DELETE', headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'remove hidden room failed');
  return j;
}

export async function acceptInvite(token, inviteId) {
  const r = await authFetch(`${API_BASE}/invites/${inviteId}/accept`, { method: "POST", headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "accept invite failed");
  return j;
}

export async function declineInvite(token, inviteId) {
  const r = await authFetch(`${API_BASE}/invites/${inviteId}/decline`, { method: "POST", headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "decline invite failed");
  return j;
}

export async function listNotifications(token) {
  const r = await authFetch(`${API_BASE}/notifications`, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "list notifications failed");
  return j.notifications || [];
}

export async function markNotificationRead(token, nid) {
  const r = await authFetch(`${API_BASE}/notifications/${nid}/mark_read`, { method: "POST", headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "mark read failed");
  return j;
}

export async function deleteNotification(token, nid) {
  const r = await authFetch(`${API_BASE}/notifications/${nid}`, { method: 'DELETE', headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'delete notification failed');
  return j;
}

export async function clearNotifications(token) {
  const r = await authFetch(`${API_BASE}/notifications`, { method: 'DELETE', headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'clear notifications failed');
  return j;
}

export async function getNotificationPreferences(token) {
  const r = await authFetch(`${API_BASE}/users/me/notification_preferences`, { headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'get prefs failed');
  return j.preferences || {};
}

export async function updateNotificationPreferences(token, prefs) {
  const r = await authFetch(`${API_BASE}/users/me/notification_preferences`, { method: 'PATCH', headers: withTK({ 'Content-Type': 'application/json' }), body: JSON.stringify(prefs) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'update prefs failed');
  return j.preferences || {};
}

export async function updateRoom(token, roomId, patch) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { method: "PATCH", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify(patch) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "update room failed");
  return j.room;
}

export async function deleteRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { method: 'DELETE', headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'delete room failed');
  return j;
}

export async function updatePermissions(token, roomId, data) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/permissions`, { method: "PATCH", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "update perms failed");
  return j;
}

export async function leaveRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/leave`, { method: "POST", headers: withTK() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "leave failed");
  return j;
}

export async function clearRoomCanvas(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/clear`, {
    method: "POST",
    headers: withTK()
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "clear failed");
  return j;
}

export async function resetMyStacks(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/reset_my_stacks`, {
    method: "POST",
    headers: withTK()
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "reset stacks failed");
  return j;
}

export async function transferOwnership(token, roomId, newOwnerUsername) {
  // Backend expects { username: "..." } in the request body
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/transfer`, { method: "POST", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify({ username: newOwnerUsername }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "transfer failed");
  return j;
}
