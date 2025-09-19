import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { login } from '../api/auth';
import { walletLogin, getWalletPublicKey } from '../wallet/resvault';
import { Link, useNavigate } from 'react-router-dom';

export default function Login({ onAuthed }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const nav = useNavigate();
  async function handleSubmit(e){
    e.preventDefault();
    let walletPubKey = null;
    try {
      await walletLogin();
      walletPubKey = await getWalletPublicKey(); // optional bind on login
    } catch (_){}
    const res = await login(u, p, walletPubKey);
    try { if (res && res.token) { localStorage.setItem('token', res.token); } } catch(e){}

    try{ if (typeof onAuthed === 'function') onAuthed({token: res.token, user: res.user}); } catch(e){}
    try { if (res && res.token) { localStorage.setItem('token', res.token); } } catch(e){}
    nav('/dashboard');
  }
  return (
    <Box sx={{display:'flex',justifyContent:'center',mt:8}}>
      <Paper sx={{p:3, width: 420}}>
        <Typography variant="h6">Sign in</Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{mt:2, display:'grid', gap:2}}>
          <TextField label="Username" value={u} onChange={e=>setU(e.target.value)} required/>
          <TextField label="Password" type="password" value={p} onChange={e=>setP(e.target.value)} required/>
          <Button type="submit" variant="contained">Login</Button>
          <Typography variant="body2">No account? <Link to="/register">Create one</Link></Typography>
        </Box>
      </Paper>
    </Box>
  );
}
