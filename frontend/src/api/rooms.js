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
