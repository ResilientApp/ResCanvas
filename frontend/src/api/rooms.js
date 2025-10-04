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

export async function shareRoom(token, roomId, usernames) {
  const headers = withTK({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/share`, {
    method: "POST",
    headers,
    body: JSON.stringify({ usernames })
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
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "get room failed");
  return j.room || j;
}

export async function getRoomStrokes(token, roomId) {
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/strokes`, { headers: withTK() });
  return (await r.json()).strokes || [];
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
  const r = await authFetch(`${API_BASE}/rooms/${roomId}/transfer`, { method: "POST", headers: withTK({ "Content-Type": "application/json" }), body: JSON.stringify({ newOwner: newOwnerUsername }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "transfer failed");
  return j;
}
