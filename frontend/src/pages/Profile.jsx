
import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import { changePassword } from '../api/auth';

export default function Profile() {
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function handleChangePassword() {
    if (!password || password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    const raw = localStorage.getItem('auth');
    if (!raw) {
      alert('Not authenticated');
      return;
    }
    const auth = JSON.parse(raw);
    setBusy(true);
    try {
      await changePassword(auth.token, password);
      alert('Password changed');
      setPassword('');
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to change password');
    } finally { setBusy(false); }
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">Profile & Preferences</Typography>
      <TextField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} sx={{ my: 2 }} type="password" />
      <Box><Button variant="contained" onClick={handleChangePassword} disabled={busy}>{busy ? 'Saving...' : 'Change Password'}</Button></Box>
    </Box>
  );
}
