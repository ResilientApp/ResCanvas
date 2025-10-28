// Helper to resolve a full user object from various sources: auth, localStorage, or token payload
export function getAuthUser(auth) {
  try {
    if (auth && auth.user) return auth.user;
  } catch (e) { }

  try {
    const raw = localStorage.getItem('auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user) return parsed.user;
    }
  } catch (e) { }

  try {
    const tk = auth?.token || (localStorage.getItem('auth') ? JSON.parse(localStorage.getItem('auth')).token : null);
    if (tk && typeof tk === 'string' && tk.split('.').length === 3) {
      const payload = JSON.parse(atob(tk.split('.')[1]));

      if (payload) {
        const maybeUser = {};
        if (payload.sub) maybeUser.id = payload.sub;
        if (payload.username) maybeUser.username = payload.username;
        if (payload.email) maybeUser.email = payload.email;

        if (Object.keys(maybeUser).length > 0) return maybeUser;
      }
    }
  } catch (e) { }

  return null;
}

export default getAuthUser;
