import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography } from '@mui/material';
import { register } from '../api/auth';
import { Link, useNavigate } from 'react-router-dom';
import { formatErrorMessage, clientValidation } from '../utils/errorHandling';

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
    try {
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

      const res = await register(usernameTrim, p, null);
      onAuthed({ token: res.token, user: res.user });
      nav('/dashboard');
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
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
