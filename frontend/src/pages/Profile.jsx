
import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, FormGroup, FormControlLabel, Switch } from '@mui/material';
import SafeSnackbar from '../components/SafeSnackbar';
import { changePassword } from '../api/auth';
import { getNotificationPreferences, updateNotificationPreferences } from '../api/rooms';

export default function Profile() {
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [snack, setSnack] = React.useState({ open: false, message: '' });
  const [prefs, setPrefs] = useState({});
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('auth');
    if (!raw) return;
    const auth = JSON.parse(raw);
    (async () => {
      try {
        const p = await getNotificationPreferences(auth.token);

        const known = ['invite', 'share_added', 'ownership_transfer', 'removed', 'invite_response', 'member_left'];
        const merged = {};
        known.forEach(k => merged[k] = (p && typeof p[k] === 'boolean') ? p[k] : true);
        setPrefs(merged);
      } catch (e) {
        console.error('failed to load prefs', e);
      }
    })();
  }, []);

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

  async function togglePref(key, value) {
    const raw = localStorage.getItem('auth');
    if (!raw) return setSnack({ open: true, message: 'Not authenticated' });
    const auth = JSON.parse(raw);
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setPrefsBusy(true);
    try {
      await updateNotificationPreferences(auth.token, next);
      setSnack({ open: true, message: 'Preferences saved' });
    } catch (e) {
      console.error('save prefs failed', e);
      setSnack({ open: true, message: 'Failed to save preferences' });
    } finally { setPrefsBusy(false); }
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">Profile & Preferences</Typography>
      <TextField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} sx={{ my: 2 }} type="password" />
      <Box><Button variant="contained" onClick={handleChangePassword} disabled={busy}>{busy ? 'Saving...' : 'Change Password'}</Button></Box>
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1">Notification Preferences</Typography>
        <FormGroup>
          {Object.keys(prefs).length === 0 && <Typography variant="body2">Loading preferences...</Typography>}
          {Object.keys(prefs).map(k => (
            <FormControlLabel key={k} control={<Switch checked={prefs[k]} onChange={(e) => togglePref(k, e.target.checked)} disabled={prefsBusy} />} label={k.replace(/_/g, ' ')} />
          ))}
        </FormGroup>
      </Box>
      <SafeSnackbar open={snack.open} message={snack.message} autoHideDuration={4000} onClose={() => setSnack({ open: false, message: '' })} />
    </Box>
  );
}
