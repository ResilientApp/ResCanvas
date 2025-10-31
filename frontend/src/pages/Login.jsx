import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { login } from '../api/auth';
import { API_BASE } from '../config/apiConfig';
import { Link, useNavigate } from 'react-router-dom';
import { formatErrorMessage, clientValidation } from '../utils/errorHandling';

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

    // Client-side validation to provide immediate feedback
    const usernameTrim = (u || '').trim();
    const usernameError = clientValidation.username(usernameTrim);
    if (usernameError) {
      setError(usernameError);
      setLoading(false);
      return;
    }

    const passwordError = clientValidation.password(p);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    try {
      console.log('Attempting API login...');
      console.log('Making fetch request to:', `${API_BASE}/auth/login`);
      console.log('Request body:', { username: usernameTrim, password: '***' });

      const res = await login(usernameTrim, p, null);
      console.log('API login successful:', res);
      onAuthed({ token: res.token, user: res.user });
      nav('/dashboard');
    } catch (err) {
      console.error('Login failed:', err);
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
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
