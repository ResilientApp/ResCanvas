import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, Button, Stack, Breadcrumbs, Chip, Avatar, IconButton } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NotificationsMenu from './NotificationsMenu';
import { refreshToken, logout } from '../api/auth';
import { isTokenValid } from '../utils/authUtils';

// Import pages
import Blog from '../Blog';
import MetricsDashboard from '../MetricsDashboard';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Room from '../pages/Room';
import App from '../App';

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

  async function doRefresh() {
    // Disabled automatic refresh for now since it clears auth on failure
    // TODO: Implement proper refresh token handling with cookies
    return;

    try {
      const j = await refreshToken();
      const nxt = { token: j.token, user: j.user };
      setAuth(nxt);
      localStorage.setItem('auth', JSON.stringify(nxt));
    } catch (_) {
      // If refresh fails, don't clear auth immediately
      console.log('Token refresh failed, keeping existing token');
    }
  }

  // useEffect(() => { doRefresh(); }, []); // Disabled

  function handleAuthed(j) {
    const nxt = { token: j.token, user: j.user };
    setAuth(nxt);
    localStorage.setItem('auth', JSON.stringify(nxt));
    nav('/dashboard');
  }

  async function handleLogout() {
    try { await logout(); } catch (_) { }
    setAuth(null);
    localStorage.removeItem('auth');
    nav('/login');
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
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
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <img src="../logo.png" alt="ResCanvas Logo" style={{ height: '60px' }} />
          </Link>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {auth && <NotificationsMenu auth={auth} />}
            {!auth ? (
              <>
                <Button color="inherit" component={Link} to="/login">Login</Button>
                <Button color="inherit" component={Link} to="/register">Register</Button>
              </>
            ) : (
              <>
                <Button color="inherit" component={Link} to="/dashboard">Dashboard</Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: 'rgba(0,0,0,0.24)', padding: '10px 12px', borderRadius: '16px' }}>
                  <Avatar sx={{ bgcolor: 'secondary.main' }}>{auth.user?.username?.charAt(0).toUpperCase()}</Avatar>
                  <Typography variant="h6" component="div" color="white" sx={{ fontWeight: 'bold' }}>{auth.user?.username}</Typography>
                  <Button color="inherit" onClick={handleLogout}>Logout</Button>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </AppBar>
      <AppBreadcrumbs auth={auth} />
      <Box>
        <Routes>
          <Route path="/" element={<HomeRedirect auth={auth} />} />
          <Route path="/legacy" element={<App auth={auth} hideHeader hideFooter />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/metrics" element={<MetricsDashboard />} />
          <Route path="/login" element={<Login onAuthed={handleAuthed} />} />
          <Route path="/register" element={<Register onAuthed={handleAuthed} />} />
          <Route path="/dashboard" element={
            <ProtectedRoute auth={auth}>
              <Dashboard auth={auth} />
            </ProtectedRoute>
          } />
          <Route path="/rooms" element={
            <ProtectedRoute auth={auth}>
              <Dashboard auth={auth} />
            </ProtectedRoute>
          } />
          <Route path="/rooms/:id" element={
            <ProtectedRoute auth={auth}>
              <Room auth={auth} />
            </ProtectedRoute>
          } />
        </Routes>
      </Box>
      {/* Bottom bar styled to match legacy App.js footer */}
      <AppBar position="static" sx={{ marginTop: 0 }}>
        <Box
          sx={{
            minHeight: '85px',
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
            <Button color="inherit" startIcon={<></>} onClick={() => { /* optional: show help */ }} sx={{ color: 'inherit' }}>Help</Button>
            <Button color="inherit" component={Link} to="/blog" sx={{ color: 'inherit' }}>Blog</Button>
            <Button color="inherit" component={Link} to="/metrics" sx={{ color: 'inherit' }}>Metrics</Button>
          </Box>
          <Box>
            <img src="../resdb_logo.png" alt="ResilientDB Logo" style={{ height: '60px' }} />
          </Box>
        </Box>
      </AppBar>
    </Box>
  );
}