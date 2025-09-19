const API_BASE = "http://127.0.0.1:10010";

export async function register(username, password, walletPubKey) {
  const r = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({username, password, walletPubKey})
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "register failed");
  return j;
}

export async function login(username, password, walletPubKey) {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({username, password, walletPubKey})
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "login failed");
  return j;
}

export async function getMe(token) {
  const r = await fetch(`${API_BASE}/auth/me`, {
    headers: {Authorization: `Bearer ${token}`}
  });
  return await r.json();
}
