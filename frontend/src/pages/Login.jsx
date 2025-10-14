import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { login } from '../api/auth';
import { API_BASE } from '../config/apiConfig';
import { walletLogin, getWalletPublicKey } from '../wallet/resvault';
import { Link, useNavigate } from 'react-router-dom';

export default function Login({ onAuthed }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('Login attempt:', { username: u, password: p.length > 0 ? '***' : 'empty' });

    let walletPubKey = null;
    try {
      console.log('Attempting wallet login...');
      // Set a timeout for wallet operations to prevent hanging
      await Promise.race([
        (async () => {
          await walletLogin();
          walletPubKey = await getWalletPublicKey();
          console.log('Wallet login successful:', walletPubKey);
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Wallet timeout')), 3000))
      ]);
    } catch (err) {
      console.warn('Wallet login failed or timed out (optional):', err.message);
    }

    // Client-side validation to mirror backend rules and avoid 400s
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

    try {
      console.log('Attempting API login...');
      console.log('Making fetch request to:', `${API_BASE}/auth/login`);
      console.log('Request body:', { username: usernameTrim, password: '***', walletPubKey });

      const res = await login(usernameTrim, p, walletPubKey);
      console.log('API login successful:', res);
      onAuthed({ token: res.token, user: res.user });
      nav('/dashboard');
    } catch (err) {
      // Try to show detailed server validation errors when available
      console.error('Login failed:', err);
      let msg = err.message || 'Login failed';
      try {
        if (err && err.body && err.body.errors) {
          // Combine field errors into a single message
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
        <Typography variant="h6">Sign in</Typography>
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, display: 'grid', gap: 2 }}>
          <TextField
            label="Username"
            value={u}
            onChange={e => setU(e.target.value)}
            disabled={loading}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={p}
            onChange={e => setP(e.target.value)}
            disabled={loading}
            required
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Login'}
          </Button>
          <Typography variant="body2">No account? <Link to="/register">Create one</Link></Typography>
        </Box>
      </Paper>
    </Box>
  );
}
