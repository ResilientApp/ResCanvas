import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import RouterLinkWrapper from './RouterLinkWrapper';
import { getUsername } from '../utils/getUsername';
import { getAuthUser } from '../utils/getAuthUser';
import { AppBar, Toolbar, Typography, Box, Button, Stack, Breadcrumbs, Chip, Avatar, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import HomeIcon from '@mui/icons-material/Home';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import HelpIcon from '@mui/icons-material/Help';
import DescriptionIcon from '@mui/icons-material/Description';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import ArticleIcon from '@mui/icons-material/Article';
import NotificationsMenu from './NotificationsMenu';
import { refreshToken, logout, getMe } from '../api/auth';
import { isTokenValid } from '../utils/authUtils';

// Import pages
import Blog from '../Blog';
import MetricsDashboard from '../MetricsDashboard';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Room from '../pages/Room';
import App from '../App';
import Profile from '../pages/Profile';
import RoomSettings from '../pages/RoomSettings';
import theme from '../theme';
// Snackbar replaced with SafeSnackbar to avoid forwarding ownerState into DOM
import SafeSnackbar from './SafeSnackbar';

// Protected Route component
function ProtectedRoute({ children, auth }) {
  if (!auth?.token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Home redirect component  
function HomeRedirect({ auth }) {
  if (auth?.token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

// Breadcrumb navigation component
function AppBreadcrumbs({ auth }) {
  const location = useLocation();

  // NOTE: previously this component toggled global document/html overflow
  // to disable document scrolling on non-dashboard routes. That approach
  // caused many pages to become non-scrollable and risked content being
  // cut off by the sticky footer. We avoid manipulating global overflow
  // here and instead rely on per-page or the central page container to
  // provide scrolling behaviour.
  const pathnames = location.pathname.split('/').filter((x) => x);

  // Don't show breadcrumbs on login/register pages
  if (!auth || ['login', 'register'].includes(pathnames[0])) {
    return null;
  }

  const breadcrumbNameMap = {
    'dashboard': 'Dashboard',
    'rooms': 'Rooms',
    'profile': 'Profile',
    'legacy': 'Legacy Canvas'
  };

  return (
    <Box sx={{ p: 1, bgcolor: 'grey.50' }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        <Link
          to="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Home
        </Link>
        {pathnames.map((value, index) => {
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          const isLast = index === pathnames.length - 1;
          const label = breadcrumbNameMap[value] || value;

          return isLast ? (
            <Chip key={to} label={label} size="small" />
          ) : (
            <Link key={to} to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
              {label}
            </Link>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
}

export default function Layout() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Check if token is still valid
      if (parsed.token && isTokenValid(parsed.token)) {
        return parsed;
      } else {
        // Token expired, clear it
        localStorage.removeItem('auth');
        return null;
      }
    }
    return null;
  });
  const nav = useNavigate();
  // Always use the Layout header/footer for consistent theme across the app
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [globalSnack, setGlobalSnack] = useState({ open: false, message: '' });

  async function doRefresh() {
    // Try the server-side refresh (uses httpOnly cookie set by login)
    try {
      const j = await refreshToken();
      if (j && j.token) {
        // Preserve existing user object if server didn't send it.
        // If server returned only a token, try to fetch /auth/me using
        // the new token so the client has a populated user object and
        // doesn't enter a token-only transient state which causes
        // parts of the UI (like Canvas) to crash when they expect
        // auth.user to be present.
        const raw = localStorage.getItem('auth');
        const existingUser = raw ? JSON.parse(raw).user : null;

        let resolvedUser = j.user || null;

        if (!resolvedUser) {
          try {
            const me = await getMe(j.token);
            // getMe may return an object containing user info directly
            // or a wrapper; try common shapes.
            if (me) {
              if (me.user) resolvedUser = me.user;
              else if (me.username || me.id) resolvedUser = me;
            }
          } catch (meErr) {
            // If fetching /auth/me fails, fall back to any existing cached user
            // rather than leaving the client in a token-only state.
            console.warn('Failed to fetch user after refresh:', meErr?.message || meErr);
            resolvedUser = existingUser || null;
          }
        }

        const nxt = { token: j.token, user: resolvedUser || existingUser || null };
        setAuth(nxt);
        try { localStorage.setItem('auth', JSON.stringify(nxt)); } catch (e) { }
      }
    } catch (err) {
      // If refresh fails, clear local auth to avoid continuing to use an
      // expired token. Keeping an expired token can prevent the client from
      // joining its personal socket room (server will ignore invalid tokens),
      // which stops real-time notifications (invites) from being delivered.
      console.log('Token refresh failed — clearing local auth and redirecting to login');
      try { setAuth(null); } catch (e) { }
      try { localStorage.removeItem('auth'); } catch (e) { }
      try {
        // Send the user to login so they can re-establish a fresh session.
        if (window.location.pathname !== '/login') nav('/login');
      } catch (e) { /* ignore navigation errors */ }
    }
  }

  useEffect(() => { doRefresh(); }, []);

  // Listen for dispatched 'rescanvas:notify' events so modules can request a themed Snackbar.
  useEffect(() => {
    const handler = (ev) => {
      try {
        const d = ev && ev.detail ? ev.detail : { message: String(ev) };
        setGlobalSnack({ open: true, message: String(d.message || d), duration: d.duration || 4000 });
      } catch (e) {
        console.warn('notify event handler error', e);
      }
    };
    window.addEventListener('rescanvas:notify', handler);
    return () => window.removeEventListener('rescanvas:notify', handler);
  }, []);

  function handleAuthed(j) {
    const nxt = { token: j.token, user: j.user };
    setAuth(nxt);
    localStorage.setItem('auth', JSON.stringify(nxt));
    nav('/dashboard');
  }

  const handleHelpOpen = () => setHelpOpen(true);
  const handleHelpClose = () => setHelpOpen(false);
  const handleRedirect = () => { setHelpOpen(false); nav('/blog'); };

  async function handleLogout() {
    try { await logout(); } catch (_) { }
    setAuth(null);
    localStorage.removeItem('auth');
    nav('/login');
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        // CSS variable for footer height so multiple elements can stay in sync
        '--rescanvas-footer-height': '85px'
      }}>
        {/* Top bar styled to match legacy App.js header */}
        <AppBar position="static" sx={{ boxShadow: 'none' }}>
          <Box
            sx={{
              minHeight: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 2,
              paddingRight: 3,
              backgroundImage: `
              linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)),
              url('/toolbar/toolbar-bg.jpeg')
            `,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              boxShadow: '0 6px 12px rgba(0, 0, 0, 0.12)',
              zIndex: 10,
            }}
          >
            <RouterLinkWrapper to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <img src="../logo.png" alt="ResCanvas Logo" style={{ height: '60px' }} />
            </RouterLinkWrapper>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {auth && <NotificationsMenu auth={auth} />}
              {!auth ? (
                <>
                  <Button color="inherit" component={RouterLinkWrapper} to="/login" sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}>Login</Button>
                  <Button color="inherit" component={RouterLinkWrapper} to="/register" sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}>Register</Button>
                </>
              ) : (
                <>
                  <Button color="inherit" component={RouterLinkWrapper} to="/dashboard" sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.30)' }, transition: 'all 120ms ease' }}>Dashboard</Button>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RouterLinkWrapper to="/profile" style={{ textDecoration: 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: 'rgba(0,0,0,0.24)', padding: '10px 12px', borderRadius: '16px' }}>
                        {(() => {
                          try {
                            const uname = getUsername(auth) || '';
                            return (
                              <>
                                <Avatar sx={{ bgcolor: 'secondary.main' }}>{uname.charAt(0).toUpperCase()}</Avatar>
                                <Typography variant="h6" component="div" color="white" sx={{ fontWeight: 'bold' }}>{uname}</Typography>
                              </>
                            );
                          } catch (e) {
                            try {
                              const user = getAuthUser(auth) || {};
                              const uname = user.username || '';
                              return (
                                <>
                                  <Avatar sx={{ bgcolor: 'secondary.main' }}>{(uname || '').charAt(0).toUpperCase()}</Avatar>
                                  <Typography variant="h6" component="div" color="white" sx={{ fontWeight: 'bold' }}>{uname}</Typography>
                                </>
                              );
                            } catch (e2) {
                              return (
                                <>
                                  <Avatar sx={{ bgcolor: 'secondary.main' }}>{''}</Avatar>
                                  <Typography variant="h6" component="div" color="white" sx={{ fontWeight: 'bold' }}></Typography>
                                </>
                              );
                            }
                          }
                        })()}
                      </Box>
                    </RouterLinkWrapper>
                    <Button color="inherit" onClick={handleLogout} sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(255,255,255,0.20)' }, transition: 'all 120ms ease' }}>Logout</Button>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        </AppBar>
        <Dialog open={helpOpen} onClose={handleHelpClose} aria-labelledby="help-dialog-title" maxWidth="md" fullWidth>
          <DialogTitle id="help-dialog-title" sx={{ bgcolor: 'primary.main', color: 'white' }}>ResCanvas Help</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>
              ResCanvas is a collaborative drawing platform that stores strokes in ResilientDB. Use the canvas to draw and the room system to collaborate with others.
            </Typography>
            <Typography variant="h6">How to Use</Typography>
            <ul>
              <li>Click and drag on the canvas to draw.</li>
              <li>Strokes are saved on mouse release and synchronized in real-time.</li>
              <li>Use the toolbar to change color and brush size.</li>
              <li>Use Rooms to create or join collaborative canvases.</li>
            </ul>
            <Box sx={{ mt: 1 }}>
              <Button color="inherit" startIcon={<DescriptionIcon />} onClick={handleRedirect} sx={{ color: 'inherit' }}>Read our Blog</Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleHelpClose} sx={{ px: 4, bgcolor: '#25D8C5' }} variant="contained">Close</Button>
          </DialogActions>
        </Dialog>
        <AppBreadcrumbs auth={auth} />
        <SafeSnackbar open={globalSnack.open} message={globalSnack.message} autoHideDuration={globalSnack.duration || 4000} onClose={() => setGlobalSnack({ open: false, message: '', duration: 4000 })} />
        {/* Central area: always allow scrolling here and reserve space for the footer
      so page content can't be obscured by the sticky bottom bar. Individual
      pages may still provide their own scroll containers if desired. */}
        <Box className="page-scroll-container" sx={{ flex: 1, overflow: 'auto', pb: 'calc(var(--rescanvas-footer-height) + 1000px)' }}>
          <Routes>
            <Route path="/" element={<HomeRedirect auth={auth} />} />
            <Route path="/legacy" element={<App auth={auth} hideHeader hideFooter />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/metrics" element={<MetricsDashboard />} />
            <Route path="/login" element={<Login onAuthed={handleAuthed} />} />
            <Route path="/register" element={<Register onAuthed={handleAuthed} />} />
            <Route path="/dashboard" element={
              <ProtectedRoute auth={auth}>
                {/*
                Use an explicit calc() height for the dashboard scroll container so it
                reliably scrolls independently of document/html overflow settings.
                Reserve space for the top bar + breadcrumb + footer (approx 200px).
              */}
                <Box sx={{ height: 'calc(100vh - 225px)', overflow: 'auto' }} className="page-scrollable">
                  <Dashboard auth={auth} />
                </Box>
              </ProtectedRoute>
            } />
            <Route path="/rooms" element={
              <ProtectedRoute auth={auth}>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            } />
            <Route path="/rooms/:id" element={
              <ProtectedRoute auth={auth}>
                <Room auth={auth} />
              </ProtectedRoute>
            } />
            <Route path="/rooms/:id/settings" element={
              <ProtectedRoute auth={auth}>
                <RoomSettings />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute auth={auth}>
                <Profile />
              </ProtectedRoute>
            } />
          </Routes>
        </Box>
        {/* Bottom bar styled to match legacy App.js footer */}
        <AppBar position="sticky" sx={{ marginTop: 0, bottom: 0, zIndex: 11 }}>
          <Box
            sx={{
              // Use the shared CSS variable for minHeight so it matches the page padding
              minHeight: 'var(--rescanvas-footer-height)',
              backgroundColor: '#1E232E',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingX: 2,
              boxShadow: '0 -6px 12px rgba(0, 0, 0, 0.12)',
              zIndex: 10,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', color: '#25D8C5', gap: 1 }}>
              <Button
                color="inherit"
                startIcon={<HelpIcon />}
                onClick={handleHelpOpen}
                sx={{ color: 'inherit', '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}
              >
                Help
              </Button>
              <Button
                component={RouterLinkWrapper}
                to="/blog"
                sx={{ color: 'inherit', '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}
                startIcon={<DescriptionIcon />}
              >
                Blog
              </Button>
              <Button
                component={RouterLinkWrapper}
                to="/metrics"
                sx={{ color: 'inherit', '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}
                startIcon={<AnalyticsIcon />}
              >
                Metrics
              </Button>
            </Box>
            <Box>
              <Button
                component="a"
                href="https://expolab.resilientdb.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ResilientDB"
                sx={{ p: 0, minWidth: 0, '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.40)' }, transition: 'all 120ms ease' }}
              >
                <img src="../resdb_logo.png" alt="ResilientDB Logo" style={{ height: '60px' }} />
              </Button>
            </Box>
          </Box>
        </AppBar>
      </Box>
    </ThemeProvider>
  );
}