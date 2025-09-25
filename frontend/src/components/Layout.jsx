import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, Button, Stack, Breadcrumbs, Chip } from '@mui/material';
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
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1 }}>
            <Link to="/" style={{ color: '#fff', textDecoration: 'none' }}>ResCanvas</Link>
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {auth && <NotificationsMenu auth={auth} />}
            {!auth ? (
              <>
                <Button color="inherit" component={Link} to="/login">Login</Button>
                <Button color="inherit" component={Link} to="/register">Register</Button>
              </>
            ) : (
              <>
                <Button color="inherit" component={Link} to="/dashboard">Dashboard</Button>
                <Typography variant="body2">{auth.user?.username}</Typography>
                <Button color="inherit" onClick={handleLogout}>Logout</Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>
      <AppBreadcrumbs auth={auth} />
      <Box>
        <Routes>
          <Route path="/" element={<HomeRedirect auth={auth} />} />
          <Route path="/legacy" element={<App auth={auth} />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/metrics" element={<MetricsDashboard />} />
          <Route path="/login" element={<Login onAuthed={handleAuthed} />} />
          <Route path="/register" element={<Register onAuthed={handleAuthed} />} />
          <Route path="/dashboard" element={
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
    </Box>
  );
}