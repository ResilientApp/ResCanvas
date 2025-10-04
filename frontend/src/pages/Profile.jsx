
import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import SafeSnackbar from '../components/SafeSnackbar';
import { changePassword } from '../api/auth';

export default function Profile() {
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [snack, setSnack] = React.useState({ open: false, message: '' });

  async function handleChangePassword() {
    if (!password || password.length < 6) {
      setSnack({ open: true, message: 'Password must be at least 6 characters' });
      return;
    }
    const raw = localStorage.getItem('auth');
    if (!raw) {
      setSnack({ open: true, message: 'Not authenticated' });
      return;
    }
    const auth = JSON.parse(raw);
    setBusy(true);
    try {
      await changePassword(auth.token, password);
      setSnack({ open: true, message: 'Password changed' });
      setPassword('');
    } catch (e) {
      console.error(e);
      setSnack({ open: true, message: e.message || 'Failed to change password' });
    } finally { setBusy(false); }
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">Profile & Preferences</Typography>
      <TextField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} sx={{ my: 2 }} type="password" />
      <Box><Button variant="contained" onClick={handleChangePassword} disabled={busy}>{busy ? 'Saving...' : 'Change Password'}</Button></Box>
      <SafeSnackbar open={snack.open} message={snack.message} autoHideDuration={4000} onClose={() => setSnack({ open: false, message: '' })} />
    </Box>
  );
}
