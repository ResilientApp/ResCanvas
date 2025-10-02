import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Divider } from '@mui/material';
import { listRooms, createRoom, shareRoom, listInvites, acceptInvite, declineInvite } from '../api/rooms';
import { useNavigate, Link } from 'react-router-dom';
import { handleAuthError } from '../utils/authUtils';

export default function Dashboard({ auth }) {
  const nav = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [invites, setInvites] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('public');
  const [shareOpen, setShareOpen] = useState(null); // roomId
  const [shareUsernames, setShareUsernames] = useState('');

  async function refresh() {
    if (!auth?.token) return;
    try {
      setRooms(await listRooms(auth.token));
      setInvites(await listInvites(auth.token));
    } catch (error) {
      console.error('Dashboard refresh failed:', error);
      handleAuthError(error);
    }
  }
  useEffect(() => { refresh(); }, [auth?.token]);

  async function doCreate() {
    const r = await createRoom(auth.token, { name: newName, type: newType });
    setOpenCreate(false); setNewName('');
    await refresh();
    nav(`/rooms/${r.id}`);
  }

  async function doShare() {
    const usernames = shareUsernames.split(',').map(s => s.trim()).filter(Boolean);
    await shareRoom(auth.token, shareOpen, usernames);
    setShareOpen(null); setShareUsernames('');
  }

  function Section({ title, items }) {
    if (!items.length) return null;
    return (
      <Box>
        <Typography variant="overline" sx={{ opacity: 0.7 }}>{title}</Typography>
        <Stack sx={{ mt: 1, maxHeight: '400px', overflow: 'auto' }} spacing={1}>
          {items.map(r => (
            <Paper key={r.id} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: '250px' }}>
                <Typography variant="subtitle1" component={Link} to={`/rooms/${r.id}`} style={{ textDecoration: 'none' }}>{r.name}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={r.type} />
                  <Chip size="small" label={`${r.memberCount} member${r.memberCount !== 1 ? 's' : ''}`} />
                  {r.ownerName && <Chip size="small" label={`owner: ${r.ownerName}`} />}
                </Stack>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button size="small" onClick={() => setShareOpen(r.id)}>Share</Button>
                {r.myRole !== 'owner' ? (
                  <Button size="small" color="error" onClick={() => {/* TODO: leave */ }}>Leave</Button>
                ) : (
                  <Button size="small" color="error" onClick={() => {/* TODO: delete/archive */ }}>Delete</Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>
    );
  }

  const grouped = {
    public: rooms.filter(r => r.type === 'public'),
    private: rooms.filter(r => r.type === 'private'),
    secure: rooms.filter(r => r.type === 'secure')
  };

  return (
    <Box sx={{
      height: '100vh',
      overflow: 'auto',
      p: 3,
      display: 'grid',
      gap: 3
    }}>
      <Typography variant="h5">Dashboard</Typography>

      {/* Actions */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button variant="contained" onClick={() => { setNewType('public'); setOpenCreate(true); }}>New Public Room</Button>
        <Button variant="contained" onClick={() => { setNewType('private'); setOpenCreate(true); }}>New Private Room</Button>
        <Button variant="contained" onClick={() => { setNewType('secure'); setOpenCreate(true); }}>New Secure Room</Button>
        <Button variant="outlined" component={Link} to="/legacy">Legacy Canvas</Button>
      </Stack>

      {/* Pending invites */}
      <Box>
        <Typography variant="overline" sx={{ opacity: 0.7 }}>Pending Invites</Typography>
        <Stack sx={{ mt: 1, maxHeight: '300px', overflow: 'auto' }} spacing={1}>
          {invites.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
          {invites.map(inv => (
            <Paper key={inv.id} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: '200px' }}>
                <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>{inv.roomName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                  Invited by {inv.inviterName} as {inv.role}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button variant="contained" size="small" onClick={async () => { await acceptInvite(auth.token, inv.id); refresh(); }}>Accept</Button>
                <Button size="small" onClick={async () => { await declineInvite(auth.token, inv.id); refresh(); }}>Decline</Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>

      <Divider />

      {/* Rooms by type */}
      <Section title="Public Rooms" items={grouped.public} />
      <Section title="Private Rooms" items={grouped.private} />
      <Section title="Secure Rooms" items={grouped.secure} />

      {/* Create dialog */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)}>
        <DialogTitle>Create {newType} room</DialogTitle>
        <DialogContent>
          <TextField label="Name" value={newName} onChange={e => setNewName(e.target.value)} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Close</Button>
          <Button onClick={doCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={!!shareOpen} onClose={() => setShareOpen(null)}>
        <DialogTitle>Share room</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>Comma-separated usernames to add as editors.</Typography>
          <TextField label="Usernames" value={shareUsernames} onChange={e => setShareUsernames(e.target.value)} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(null)}>Close</Button>
          <Button onClick={doShare} variant="contained">Share</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
