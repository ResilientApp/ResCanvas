export function getUsername(auth) {
  try {
    if (auth && auth.user && auth.user.username) return auth.user.username;
  } catch (e) { }

  try {
    const raw = localStorage.getItem('auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user && parsed.user.username) return parsed.user.username;
    }
  } catch (e) { }

  try {
    const tk = auth?.token || (localStorage.getItem('auth') ? JSON.parse(localStorage.getItem('auth')).token : null);
    if (tk && typeof tk === 'string' && tk.split('.').length === 3) {
      const payload = JSON.parse(atob(tk.split('.')[1]));
      if (payload && (payload.username || payload.sub)) return payload.username || payload.sub;
    }
  } catch (e) { }

  return null;
}

export default getUsername;
