import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Divider, Snackbar } from '@mui/material';
import { listRooms, createRoom, shareRoom, listInvites, acceptInvite, declineInvite, updateRoom } from '../api/rooms';
import { getHiddenRooms, addHiddenRoom } from '../api/rooms';
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(null); // roomId pending client-delete (hide)
  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(null); // owner-only permanent delete
  const [destructiveConfirmText, setDestructiveConfirmText] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '' });

  async function refresh() {
    if (!auth?.token) return;
    try {
      // Fetch active rooms (default) and archived rooms (owners/members may have them)
      const all = await listRooms(auth.token);
      let deletedIds = [];
      try {
        // Prefer server-side hiddenRooms list; fall back to localStorage
        deletedIds = await getHiddenRooms(auth.token);
      } catch (e) {
        const deletedStr = localStorage.getItem('rescanvas:deletedRooms');
        try { deletedIds = deletedStr ? JSON.parse(deletedStr) : []; } catch (e2) { deletedIds = []; }
      }

      setRooms(all.filter(r => !r.archived && !deletedIds.includes(r.id)));
      const archivedAll = await listRooms(auth.token, true);
      setArchivedRooms(archivedAll.filter(r => r.archived && !deletedIds.includes(r.id)));
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
                        <>
                          <Button size="small" color="primary" onClick={() => setConfirmUnarchiveOpen(r.id)}>Unarchive</Button>
                          <Button size="small" color="error" onClick={() => setConfirmDestructiveOpen(r.id)}>Delete (permanent)</Button>
                        </>
                      ) : (
                        <>
                          <Button size="small" color="error" onClick={() => setConfirmLeaveOpen(r.id)}>Leave</Button>
                          <Button size="small" color="error" onClick={() => setConfirmDeleteOpen(r.id)}>Delete</Button>
                        </>
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

      {/* Confirm Delete (client-side hide) */}
      <Dialog open={!!confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(null)}>
        <DialogTitle>Delete (hide) archived room</DialogTitle>
        <DialogContent>
          <Typography>This will remove the archived room from your lists. This is a local, non-destructive action that only affects your account on this browser.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => {
            try {
              const id = confirmDeleteOpen;
              // Persist preference to server; fall back to localStorage when server call fails
              addHiddenRoom(auth.token, id).then(() => {
                setSnack({ open: true, message: 'Room removed from your lists' });
              }).catch((e) => {
                console.warn('addHiddenRoom failed, falling back to localStorage', e);
                const key = 'rescanvas:deletedRooms';
                const cur = localStorage.getItem(key);
                let arr = [];
                try { arr = cur ? JSON.parse(cur) : []; } catch (e) { arr = []; }
                if (!arr.includes(id)) arr.push(id);
                localStorage.setItem(key, JSON.stringify(arr));
                setSnack({ open: true, message: 'Room removed from your lists (local only)' });
              });
            } catch (e) {
              console.error('Failed to delete (hide) room locally', e);
              setSnack({ open: true, message: 'Failed to remove room' });
            } finally {
              setConfirmDeleteOpen(null);
              refresh();
            }
          }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Destructive Delete (owner-only, irreversible) */}
      <Dialog open={!!confirmDestructiveOpen} onClose={() => { setConfirmDestructiveOpen(null); setDestructiveConfirmText(''); }}>
        <DialogTitle>Permanently delete room</DialogTitle>
        <DialogContent>
          <Typography color="error" sx={{ mb: 1 }}>This action is irreversible. Deleting a room will permanently remove it and ALL its data for every user.</Typography>
          <Typography sx={{ mb: 1 }}>To confirm, type <strong>DELETE</strong> in the box below.</Typography>
          <TextField fullWidth value={destructiveConfirmText} onChange={e => setDestructiveConfirmText(e.target.value)} placeholder="Type DELETE to confirm" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmDestructiveOpen(null); setDestructiveConfirmText(''); }}>Cancel</Button>
          <Button variant="contained" color="error" disabled={destructiveConfirmText !== 'DELETE'} onClick={async () => {
            try {
              const id = confirmDestructiveOpen;
              const mod = await import('../api/rooms');
              await mod.deleteRoom(auth.token, id);
              setSnack({ open: true, message: 'Room permanently deleted' });
            } catch (e) {
              console.error('Permanent delete failed', e);
              setSnack({ open: true, message: 'Failed to delete room: ' + (e?.message || e) });
            } finally {
              setConfirmDestructiveOpen(null);
              setDestructiveConfirmText('');
              await refresh();
            }
          }}>Delete permanently</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Box>
        <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ open: false, message: '' })} message={snack.message} />
      </Box>
    </Box>
  );
}
