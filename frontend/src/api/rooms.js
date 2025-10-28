/**
 * Room API - All endpoints are protected by server-side middleware
 * 
 * Authentication: All endpoints require valid JWT token in Authorization header
 * Authorization: Room-specific endpoints enforce ownership/membership via middleware
 * Validation: All inputs are validated server-side (client validation is UX only)
 * 
 * Error Responses:
 * - 401: Unauthorized (invalid/expired token) → Redirect to login
 * - 403: Forbidden (insufficient permissions) → Show error message
 * - 400: Bad Request (invalid input) → Show validation error
 * - 404: Not Found (resource doesn't exist) → Show not found message
 */

import { authFetch, getAuthToken } from '../utils/authUtils';
import { API_BASE } from '../config/apiConfig';
import { handleApiResponse } from '../utils/errorHandling';

const withTK = (headers = {}) => {
  const tk = getAuthToken();
  return { ...(headers || {}), ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
};

/**
 * Create a new room
 * Backend: POST /rooms
 * Middleware: @require_auth + @validate_request_data
 * Validates: name (1-256 chars), type (public/private/secure)
 */
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

/**
 * List rooms accessible to the authenticated user
 * Backend: GET /rooms
 * Middleware: @require_auth
 * Filtering: Server-side by type, archived status, ownership
 * Sorting: Server-side by createdAt, updatedAt, name
 * Pagination: Server-side (page, per_page parameters)
 */
export async function listRooms(token, options = {}) {
  // options: { includeArchived, sortBy, order, page, per_page, type }
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
  // Return structured paging response
  return { rooms: j.rooms || [], total: j.total || (j.rooms ? j.rooms.length : 0), page: j.page || 1, per_page: j.per_page || (j.rooms ? j.rooms.length : 0) };
}

export async function shareRoom(token, roomId, usernamesOrObjects) {
  // usernamesOrObjects can be either ["alice"] or [{ username: "alice", role: "editor" }]
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

/**
 * Get detailed information about a specific room
 * Backend: GET /rooms/{id}
 * Middleware: @require_auth + @require_room_access
 * Access: Owner, members, or public rooms (auto-joins public rooms)
 */
export async function getRoomDetails(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}`, { headers: withTK() });
  const j = await handleApiResponse(r);
  return j.room || j;
}

/**
 * Get strokes from a room
 * Backend: GET /rooms/{id}/strokes
 * Middleware: @require_auth + @require_room_access
 * Filtering: Server-side by time range (start, end timestamps)
 * Pagination: Server-side (offset, limit parameters)
 * Access: Requires room membership or public room
 */
export async function getRoomStrokes(token, roomId, opts = {}) {
  // opts: { start, end, offset, limit } - epoch ms values for history range
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
  // Backend expects { username: "..." } in the request body
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/transfer`, { method: "POST", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify({ username: newOwnerUsername }) });
  const j = await handleApiResponse(r);
  return j;
}
