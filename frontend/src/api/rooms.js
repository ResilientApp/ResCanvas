const API_BASE = "http://127.0.0.1:10010";

export async function createRoom(token, {name, type}) {
  const r = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: {"Content-Type":"application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({name, type})
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "create room failed");
  return j.room;
}

export async function listRooms(token) {
  const r = await fetch(`${API_BASE}/rooms`, {headers:{Authorization:`Bearer ${token}`}});
  return (await r.json()).rooms || [];
}

export async function shareRoom(token, roomId, usernames) {
  const r = await fetch(`${API_BASE}/rooms/${roomId}/share`, {
    method: "POST",
    headers: {"Content-Type":"application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({usernames})
  });
  return await r.json();
}

export async function getRoomDetails(token, roomId) {
  const r = await fetch(`${API_BASE}/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "get room failed");
  // backend returns { status: 'ok', room: {...} } or similar
  return j.room || j;
}

export async function getRoomStrokes(token, roomId) {
  const r = await fetch(`${API_BASE}/rooms/${roomId}/strokes`, {
    headers: {Authorization: `Bearer ${token}`}
  });
  return (await r.json()).strokes || [];
}

export async function postRoomStroke(token, roomId, stroke, signature, signerPubKey) {
  const r = await fetch(`${API_BASE}/rooms/${roomId}/strokes`, {
    method: "POST",
    headers: {"Content-Type":"application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({stroke, signature, signerPubKey})
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "post stroke failed");
  return j;
}

export async function listInvites(token){
  const r = await fetch(`${API_BASE}/invites`, { headers:{ Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "list invites failed");
  return j.invites || [];
}

export async function acceptInvite(token, inviteId){
  const r = await fetch(`${API_BASE}/invites/${inviteId}/accept`, { method: "POST", headers: { Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "accept invite failed");
  return j;
}

export async function declineInvite(token, inviteId){
  const r = await fetch(`${API_BASE}/invites/${inviteId}/decline`, { method: "POST", headers: { Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "decline invite failed");
  return j;
}

export async function listNotifications(token){
  const r = await fetch(`${API_BASE}/notifications`, { headers:{ Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "list notifications failed");
  return j.notifications || [];
}

export async function markNotificationRead(token, nid){
  const r = await fetch(`${API_BASE}/notifications/${nid}/mark_read`, { method: "POST", headers:{ Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "mark read failed");
  return j;
}

export async function updateRoom(token, roomId, patch){
  const r = await fetch(`${API_BASE}/rooms/${roomId}`, { method: "PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}`}, body: JSON.stringify(patch) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "update room failed");
  return j.room;
}

export async function updatePermissions(token, roomId, data){
  const r = await fetch(`${API_BASE}/rooms/${roomId}/permissions`, { method: "PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}`}, body: JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "update perms failed");
  return j;
}

export async function leaveRoom(token, roomId){
  const r = await fetch(`${API_BASE}/rooms/${roomId}/leave`, { method: "POST", headers:{ Authorization:`Bearer ${token}`}});
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "leave failed");
  return j;
}

export async function transferOwnership(token, roomId, newOwnerUsername){
  const r = await fetch(`${API_BASE}/rooms/${roomId}/transfer`, { method: "POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}`}, body: JSON.stringify({ newOwner: newOwnerUsername }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "transfer failed");
  return j;
}
