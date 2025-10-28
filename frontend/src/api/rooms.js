
import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';
import { handleApiResponse } from '../utils/errorHandling';

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
  const j = await handleApiResponse(r);
  return j.room;
}

export async function listRooms(token, options = {}) {
  const includeArchived = options.includeArchived ? 1 : 0;
  const params = new URLSearchParams();
  if (includeArchived) params.set('archived', '1');
  if (options.sortBy) params.set('sort_by', options.sortBy);
  if (options.order) params.set('order', options.order);
  if (options.page) params.set('page', String(options.page));
  if (options.per_page) params.set('per_page', String(options.per_page));
  if (options.type) params.set('type', options.type);
  const url = `${API_BASE}/rooms?${params.toString()}`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await handleApiResponse(r);
  return { rooms: j.rooms || [], total: j.total || (j.rooms ? j.rooms.length : 0), page: j.page || 1, per_page: j.per_page || (j.rooms ? j.rooms.length : 0) };
}

export async function shareRoom(token, roomId, usernamesOrObjects) {
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  let payload;
  if (Array.isArray(usernamesOrObjects) && usernamesOrObjects.length > 0 && typeof usernamesOrObjects[0] === 'object') {
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
  const j = await handleApiResponse(r);
  return j.suggestions || [];
}

export async function suggestRooms(token, q) {
  const url = `${API_BASE}/rooms/suggest?q=${encodeURIComponent(q || '')}`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.rooms || [];
}

export async function getRoomMembers(token, roomId) {
  const url = `${API_BASE}/rooms/${roomId}/members`;
  const r = await authFetch(url, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.members || [];
}

export async function getRoomDetails(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.room || j;
}

export async function getRoomStrokes(token, roomId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.start !== undefined && opts.start !== null && opts.start !== '') params.set('start', String(opts.start));
  if (opts.end !== undefined && opts.end !== null && opts.end !== '') params.set('end', String(opts.end));
  const q = params.toString();
  const url = `${API_BASE}/rooms/${roomId}/strokes${q ? `?${q}` : ''}`;
  const headers = withTK({ ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const r = await authFetch(url, { headers });
  const j = await handleApiResponse(r);
  return j.strokes || [];
}

export async function postRoomStroke(token, roomId, stroke, signature, signerPubKey) {
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/strokes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ stroke, signature, signerPubKey })
  });
  return await handleApiResponse(r);
}

export async function undoRoomAction(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/undo`, {
    method: "POST",
    headers: withTK({ "Content-Type": "application/json" })
  });
  return await handleApiResponse(r);
}

export async function redoRoomAction(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/redo`, {
    method: "POST",
    headers: withTK({ "Content-Type": "application/json" })
  });
  return await handleApiResponse(r);
}

export async function getUndoRedoStatus(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/undo_redo_status`, { headers: withTK() });
  return await handleApiResponse(r);
}

export async function listInvites(token) {
  const r = await authFetch(`${API_BASE}/invites`, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.invites || [];
}

export async function getHiddenRooms(token) {
  throw new Error('getHiddenRooms has been removed; hidden rooms are no longer supported');
}

export async function addHiddenRoom(token, roomId) {
  throw new Error('addHiddenRoom has been removed; hidden rooms are no longer supported');
}

export async function removeHiddenRoom(token, roomId) {
  throw new Error('removeHiddenRoom has been removed; hidden rooms are no longer supported');
}

export async function acceptInvite(token, inviteId) {
  const r = await authFetch(`${API_BASE}/invites/${inviteId}/accept`, { method: "POST", headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function declineInvite(token, inviteId) {
  const r = await authFetch(`${API_BASE}/invites/${inviteId}/decline`, { method: "POST", headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function listNotifications(token) {
  const r = await authFetch(`${API_BASE}/notifications`, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.notifications || [];
}

export async function markNotificationRead(token, nid) {
  const r = await authFetch(`${API_BASE}/notifications/${nid}/mark_read`, { method: "POST", headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function deleteNotification(token, nid) {
  const r = await authFetch(`${API_BASE}/notifications/${nid}`, { method: 'DELETE', headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function clearNotifications(token) {
  const r = await authFetch(`${API_BASE}/notifications`, { method: 'DELETE', headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function getNotificationPreferences(token) {
  const r = await authFetch(`${API_BASE}/users/me/notification_preferences`, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.preferences || {};
}

export async function updateNotificationPreferences(token, prefs) {
  const r = await authFetch(`${API_BASE}/users/me/notification_preferences`, { method: 'PATCH', headers: withTK({ 'Content-Type': 'application/json' }), body: JSON.stringify(prefs) });
  const j = await handleApiResponse(r);
  return j.preferences || {};
}

export async function updateRoom(token, roomId, patch) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { method: "PATCH", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify(patch) });
  const j = await handleApiResponse(r);
  return j.room;
}

export async function deleteRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { method: 'DELETE', headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function updatePermissions(token, roomId, data) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/permissions`, { method: "PATCH", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify(data) });
  const j = await handleApiResponse(r);
  return j;
}

export async function leaveRoom(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/leave`, { method: "POST", headers: withTK() });
  const j = await handleApiResponse(r);
  return j;
}

export async function clearRoomCanvas(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/clear`, {
    method: "POST",
    headers: withTK()
  });
  const j = await handleApiResponse(r);
  return j;
}

export async function resetMyStacks(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/reset_my_stacks`, {
    method: "POST",
    headers: withTK()
  });
  const j = await handleApiResponse(r);
  return j;
}

export async function transferOwnership(token, roomId, newOwnerUsername) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/transfer`, { method: "POST", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify({ username: newOwnerUsername }) });
  const j = await handleApiResponse(r);
  return j;
}
