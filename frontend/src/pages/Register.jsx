import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { register } from '../api/auth';
import { walletLogin, getWalletPublicKey } from '../wallet/resvault';
import { Link, useNavigate } from 'react-router-dom';

export default function Register({ onAuthed }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const nav = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    let walletPubKey = null;
    try {
      try { await walletLogin(); walletPubKey = await getWalletPublicKey(); } catch (_) { /* ignore wallet failures */ }
      const res = await register(u, p, walletPubKey);
      onAuthed({ token: res.token, user: res.user });
      nav('/dashboard');
    } catch (err) {
      // Surface server message if available
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <Paper sx={{ p: 3, width: 420 }}>
        <Typography variant="h6">Create account</Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, display: 'grid', gap: 2 }}>
          <TextField label="Username" value={u} onChange={e => setU(e.target.value)} required />
          <TextField label="Password" type="password" value={p} onChange={e => setP(e.target.value)} required />
          <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Registering…' : 'Register'}</Button>
          {error && <Typography color="error" variant="body2">{error}</Typography>}
          <Typography variant="body2">Have an account? <Link to="/login">Sign in</Link></Typography>
        </Box>
      </Paper>
    </Box>
  );
}
