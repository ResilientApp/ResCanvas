import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { register } from '../api/auth';
import { walletLogin, getWalletPublicKey } from '../wallet/resvault';
import { Link, useNavigate } from 'react-router-dom';

export default function Register({ onAuthed }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const nav = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    let walletPubKey = null;
    try {
      const usernameTrim = (u || '').trim();
      if (usernameTrim.length < 3) {
        setError('Username must be at least 3 characters');
        setLoading(false);
        return;
      }
      const usernameRe = /^[A-Za-z0-9_\-\.]+$/;
      if (!usernameRe.test(usernameTrim)) {
        setError('Username can only contain letters, numbers, underscore, hyphen, and dot');
        setLoading(false);
        return;
      }
      if (!p || p.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }

      try { await walletLogin(); walletPubKey = await getWalletPublicKey(); } catch (_) { /* ignore wallet failures */ }
      const res = await register(usernameTrim, p, walletPubKey);
      onAuthed({ token: res.token, user: res.user });
      nav('/dashboard');
    } catch (err) {
      // show detailed server-side validation errors when present
      let msg = err.message || 'Registration failed';
      try {
        if (err && err.body && err.body.errors) {
          const parts = Object.entries(err.body.errors).map(([k, v]) => `${k}: ${v}`);
          msg = parts.join('; ');
        } else if (err && err.body && err.body.message) {
          msg = err.body.message;
        }
      } catch (e) {
        // ignore
      }
      setError(msg);
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
