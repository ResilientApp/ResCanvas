import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Blog from './Blog';
import MetricsDashboard from './MetricsDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import { AppBar, Toolbar, Typography, Box, Button, Stack } from '@mui/material';
import NotificationsMenu from './components/NotificationsMenu';
import { refreshToken, logout } from './api/auth';

function Layout(){
  const [auth, setAuth] = useState(()=>{
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  });
  const nav = useNavigate();

  async function doRefresh(){
    try{
      const j = await refreshToken();
      const nxt = { token: j.token, user: j.user };
      setAuth(nxt);
      localStorage.setItem('auth', JSON.stringify(nxt));
    }catch(_){ /* ignore */ }
  }

  useEffect(()=>{ doRefresh(); }, []);

  function handleAuthed(j){
    const nxt = { token: j.token, user: j.user };
    setAuth(nxt);
    localStorage.setItem('auth', JSON.stringify(nxt));
    nav('/dashboard');
  }

  async function handleLogout(){
    try{ await logout(); }catch(_){}
    setAuth(null);
    localStorage.removeItem('auth');
    nav('/login');
  }

  return (
    <Box sx={{minHeight:'100vh'}}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{flex:1}}><Link to="/" style={{color:'#fff', textDecoration:'none'}}>ResCanvas</Link></Typography>
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
      <Box>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/metrics" element={<MetricsDashboard />} />
          <Route path="/login" element={<Login onAuthed={handleAuthed}/>} />
          <Route path="/register" element={<Register onAuthed={handleAuthed}/>} />
          <Route path="/dashboard" element={<Dashboard auth={auth} />} />
          <Route path="/rooms/:id" element={<Room auth={auth} />} />
        </Routes>
      </Box>
    </Box>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Layout />
  </BrowserRouter>
);

reportWebVitals();
