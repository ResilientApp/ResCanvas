import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Divider, Snackbar } from '@mui/material';
import { listRooms, createRoom, shareRoom, listInvites, acceptInvite, declineInvite, updateRoom } from '../api/rooms';
import { useNavigate, Link } from 'react-router-dom';
import { handleAuthError } from '../utils/authUtils';

export default function Dashboard({ auth }) {
  const nav = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [archivedRooms, setArchivedRooms] = useState([]);
  const [invites, setInvites] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('public');
  const [shareOpen, setShareOpen] = useState(null); // roomId
  const [shareUsernames, setShareUsernames] = useState('');
  const [shareLinkOpen, setShareLinkOpen] = useState(null); // roomId for link dialog
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(null); // roomId pending leave
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(null); // roomId pending archive (owner)
  const [confirmUnarchiveOpen, setConfirmUnarchiveOpen] = useState(null); // roomId pending unarchive (owner)
  const [snack, setSnack] = useState({ open: false, message: '' });

  async function refresh() {
    if (!auth?.token) return;
    try {
      // Fetch active rooms (default) and archived rooms (owners/members may have them)
      const all = await listRooms(auth.token);
      setRooms(all.filter(r => !r.archived));
      setArchivedRooms(await listRooms(auth.token, true));
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
          {items.map(r => {
            const isOwner = (r.myRole === 'owner') || (auth?.user && r.ownerName && auth.user.username === r.ownerName);
            return (
              <Paper key={r.id} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: '200px' }}>
                  <Typography variant="subtitle2" component={Link} to={`/rooms/${r.id}`} style={{ textDecoration: 'none' }}>{r.name}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                    <Chip size="small" label={r.type} sx={{ fontSize: '0.7rem' }} />
                    <Chip size="small" label={`${r.memberCount} member${r.memberCount !== 1 ? 's' : ''}`} sx={{ fontSize: '0.7rem' }} />
                    {r.ownerName && <Chip size="small" label={`owner: ${r.ownerName}`} sx={{ fontSize: '0.7rem' }} />}
                    {/* retention feature removed */}
                  </Stack>
                  {/* Show description if provided */}
                  {r.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-word' }}>{r.description}</Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  {/* Archived rooms are view-only; only owner can unarchive */}
                  {r.archived ? (
                    <>
                      <Button size="small" component={Link} to={`/rooms/${r.id}`}>View</Button>
                      {isOwner ? (
                        <Button size="small" color="primary" onClick={() => setConfirmUnarchiveOpen(r.id)}>Unarchive</Button>
                      ) : (
                        <Button size="small" color="error" onClick={() => setConfirmLeaveOpen(r.id)}>Leave</Button>
                      )}
                    </>
                  ) : (
                    <>
                      {r.type === 'public' ? (
                        <Button size="small" onClick={() => setShareLinkOpen(r.id)}>Share link</Button>
                      ) : (
                        <Button size="small" onClick={() => setShareOpen(r.id)}>Share</Button>
                      )}
                      {!isOwner ? (
                        <Button size="small" color="error" onClick={() => setConfirmLeaveOpen(r.id)}>Leave</Button>
                      ) : (
                        <Button size="small" color="error" onClick={() => setConfirmArchiveOpen(r.id)}>Archive</Button>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      </Box>
    );
  }

  const grouped = {
    public: rooms.filter(r => r.type === 'public'),
    private: rooms.filter(r => r.type === 'private'),
    secure: rooms.filter(r => r.type === 'secure'),
    archived: archivedRooms.filter(r => r.archived === true)
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
      <Section title="Archived Rooms" items={grouped.archived} />

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

      {/* Confirm Leave Dialog */}
      <Dialog open={!!confirmLeaveOpen} onClose={() => setConfirmLeaveOpen(null)}>
        <DialogTitle>Leave room</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to leave this room?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLeaveOpen(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={async () => {
            try {
              const roomId = confirmLeaveOpen;
              await import('../api/rooms').then(mod => mod.leaveRoom(auth.token, roomId));
              setSnack({ open: true, message: 'Left room' });
            } catch (e) {
              console.error('Leave room failed', e);
              if (e?.message && e.message.toLowerCase().includes('owner')) {
                setSnack({ open: true, message: 'You must transfer ownership before leaving this room.' });
              } else {
                setSnack({ open: true, message: 'Failed to leave room: ' + (e?.message || e) });
              }
            } finally {
              setConfirmLeaveOpen(null);
              await refresh();
            }
          }}>Leave</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Archive Dialog (owner-only) */}
      <Dialog open={!!confirmArchiveOpen} onClose={() => setConfirmArchiveOpen(null)}>
        <DialogTitle>Archive room</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to archive this room? Archiving hides the room from normal lists but preserves data. You can unarchive later.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmArchiveOpen(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={async () => {
            try {
              const roomId = confirmArchiveOpen;
              await updateRoom(auth.token, roomId, { archived: true });
              setSnack({ open: true, message: 'Room archived' });
            } catch (e) {
              console.error('Archive room failed', e);
              setSnack({ open: true, message: 'Failed to archive room: ' + (e?.message || e) });
            } finally {
              setConfirmArchiveOpen(null);
              await refresh();
            }
          }}>Archive</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Unarchive Dialog (owner-only) */}
      <Dialog open={!!confirmUnarchiveOpen} onClose={() => setConfirmUnarchiveOpen(null)}>
        <DialogTitle>Unarchive room</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to unarchive this room? This will return the room to active lists.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUnarchiveOpen(null)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={async () => {
            try {
              const roomId = confirmUnarchiveOpen;
              await updateRoom(auth.token, roomId, { archived: false });
              setSnack({ open: true, message: 'Room unarchived' });
            } catch (e) {
              console.error('Unarchive room failed', e);
              setSnack({ open: true, message: 'Failed to unarchive room: ' + (e?.message || e) });
            } finally {
              setConfirmUnarchiveOpen(null);
              await refresh();
            }
          }}>Unarchive</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Box>
        <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ open: false, message: '' })} message={snack.message} />
      </Box>
    </Box>
  );
}
