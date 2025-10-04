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
  const [shareLinkOpen, setShareLinkOpen] = useState(null); // roomId for link dialog

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

  const handleShareLink = (roomId) => {
    setShareLinkOpen(roomId);
  };

  function Section({ title, items }) {
    if (!items.length) return null;
    return (
      <Box>
        <Typography variant="overline" sx={{ opacity: 0.7 }}>{title}</Typography>
        <Stack sx={{ mt: 0.5 }} spacing={0.5}>
          {items.map(r => (
            <Paper key={r.id} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: '200px' }}>
                <Typography variant="subtitle2" component={Link} to={`/rooms/${r.id}`} style={{ textDecoration: 'none' }}>{r.name}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                  <Chip size="small" label={r.type} sx={{ fontSize: '0.7rem' }} />
                  <Chip size="small" label={`${r.memberCount} member${r.memberCount !== 1 ? 's' : ''}`} sx={{ fontSize: '0.7rem' }} />
                  {r.ownerName && <Chip size="small" label={`owner: ${r.ownerName}`} sx={{ fontSize: '0.7rem' }} />}
                  {/* Show retention info if present */}
                  {typeof r.retentionDays !== 'undefined' && (
                    <Chip size="small" label={r.retentionDays ? `retention: ${r.retentionDays}d` : 'retention: never'} sx={{ fontSize: '0.7rem' }} />
                  )}
                </Stack>
                {/* Show description if provided */}
                {r.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-word' }}>{r.description}</Typography>
                )}
              </Box>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                {r.type === 'public' ? (
                  <Button size="small" onClick={() => setShareLinkOpen(r.id)}>Share link</Button>
                ) : (
                  <Button size="small" onClick={() => setShareOpen(r.id)}>Share</Button>
                )}
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
      minHeight: 0,
      p: 1.5,
      display: 'grid',
      gap: 1.5
    }}>
      <Typography variant="h5">Dashboard</Typography>

      {/* Actions */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap">
        <Button variant="contained" size="small" onClick={() => { setNewType('public'); setOpenCreate(true); }}>New Public</Button>
        <Button variant="contained" size="small" onClick={() => { setNewType('private'); setOpenCreate(true); }}>New Private</Button>
        <Button variant="contained" size="small" onClick={() => { setNewType('secure'); setOpenCreate(true); }}>New Secure</Button>
        <Button variant="outlined" size="small" component={Link} to="/legacy">Legacy</Button>
      </Stack>

      {/* Pending invites */}
      <Box>
        <Typography variant="overline" sx={{ opacity: 0.7 }}>Pending Invites</Typography>
        <Stack sx={{ mt: 0.5 }} spacing={0.5}>
          {invites.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
          {invites.map(inv => (
            <Paper key={inv.id} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: '200px' }}>
                <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>{inv.roomName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                  Invited by {inv.inviterName} as {inv.role}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Button variant="contained" size="small" onClick={async () => {
                  try {
                    await acceptInvite(auth.token, inv.id);
                  } catch (e) {
                    // If invite was already accepted or removed, refresh to clear stale UI
                    if (e?.message && e.message.includes('Invite not pending')) {
                      console.warn('Invite race: not pending, refreshing invites');
                    } else {
                      console.error('Accept invite failed', e);
                    }
                  } finally {
                    await refresh();
                  }
                }}>Accept</Button>
                <Button size="small" onClick={async () => {
                  try {
                    await declineInvite(auth.token, inv.id);
                  } catch (e) {
                    // If invite already removed, just refresh
                    console.warn('Decline invite error (ignored):', e?.message || e);
                  } finally {
                    await refresh();
                  }
                }}>Decline</Button>
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

      {/* Share link dialog */}
      <Dialog open={!!shareLinkOpen} onClose={() => setShareLinkOpen(null)}>
        <DialogTitle>Share link</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField fullWidth value={`${window.location.origin}/rooms/${shareLinkOpen || ''}`} InputProps={{ readOnly: true }} />
            <Button onClick={() => {
              const link = `${window.location.origin}/rooms/${shareLinkOpen}`;
              navigator.clipboard?.writeText(link).then(() => {
                // no-op
              }).catch((err) => console.error('Copy failed', err));
            }}>Copy</Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareLinkOpen(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
