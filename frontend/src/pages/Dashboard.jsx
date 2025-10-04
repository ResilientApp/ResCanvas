import React, { useEffect, useState, useMemo } from 'react';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Divider, CircularProgress, Tooltip, MenuItem } from '@mui/material';
import SafeSnackbar from '../components/SafeSnackbar';
import Autocomplete from '@mui/material/Autocomplete';
import { listRooms, createRoom, shareRoom, listInvites, acceptInvite, declineInvite, updateRoom, suggestUsers, suggestRooms, getRoomMembers } from '../api/rooms';
import { getHiddenRooms, addHiddenRoom } from '../api/rooms';
import { useNavigate, Link } from 'react-router-dom';
import RouterLinkWrapper from '../components/RouterLinkWrapper';
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
  // shareUsers holds objects: { username: 'alice', role: 'editor' }
  const [shareUsers, setShareUsers] = useState([]);
  const [shareInputValue, setShareInputValue] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestOptions, setSuggestOptions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  // room search state
  const [roomSearchValue, setRoomSearchValue] = useState('');
  const [roomSuggestOpen, setRoomSuggestOpen] = useState(false);
  const [roomSuggestOptions, setRoomSuggestOptions] = useState([]);
  const [roomSuggestLoading, setRoomSuggestLoading] = useState(false);
  const [membersCache, setMembersCache] = useState({}); // roomId -> { loading, members }
  const [shareErrors, setShareErrors] = useState([]);
  const [shareSuccess, setShareSuccess] = useState({ open: false, message: '' });
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
  useEffect(() => {
    function onRoomsUpdated() { refresh(); }
    window.addEventListener('rescanvas:rooms-updated', onRoomsUpdated);
    return () => window.removeEventListener('rescanvas:rooms-updated', onRoomsUpdated);
  }, []);

  async function doCreate() {
    const r = await createRoom(auth.token, { name: newName, type: newType });
    setOpenCreate(false); setNewName('');
    await refresh();
    nav(`/rooms/${r.id}`);
  }

  async function doShare() {
    // shareUsers is an array of { username, role }
    let users = Array.isArray(shareUsers) ? shareUsers.slice() : [];
    if (shareInputValue && typeof shareInputValue === 'string' && shareInputValue.trim()) {
      users = [...users, { username: shareInputValue.trim(), role: 'editor' }];
    }
    try {
      const resp = await shareRoom(auth.token, shareOpen, users);
      // If server returned errors, surface them instead of silently closing
      const res = (resp && resp.results) || {};
      const errors = res.errors || [];
      const invited = (res.invited || []).map(i => i.username);
      const updated = (res.updated || []).map(i => i.username);
      const succeeded = [...invited, ...updated];
      if (errors && errors.length) {
        setShareErrors(errors);
        // show success for any usernames that succeeded while leaving dialog open for errors
        if (succeeded.length) {
          setShareSuccess({ open: true, message: `Shared with ${succeeded.join(', ')}` });
        }
        return;
      }
      // No errors -> fully successful share
      if (succeeded.length) {
        setShareSuccess({ open: true, message: `Shared with ${succeeded.join(', ')}` });
      }
      setShareOpen(null); setShareUsers([]); setShareErrors([]); setShareInputValue('');
      await refresh();
    } catch (e) {
      console.error('Share failed', e);
      setSnack({ open: true, message: 'Failed to share: ' + (e?.message || e) });
    }
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
                  <Typography variant="subtitle2" component={RouterLinkWrapper} to={`/rooms/${r.id}`} style={{ textDecoration: 'none' }}>{r.name}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                    <Chip size="small" label={r.type} sx={{ fontSize: '0.7rem' }} />
                    <Tooltip
                      title={(membersCache[r.id] && membersCache[r.id].members && membersCache[r.id].members.length) ? (
                        <Box>
                          {(membersCache[r.id].members || []).map((m, i) => (
                            <Typography key={i} variant="body2">{m && m.username ? m.username : String(m)}</Typography>
                          ))}
                        </Box>
                      ) : (membersCache[r.id] && membersCache[r.id].loading ? 'Loading...' : 'No members listed')}
                      onOpen={async () => {
                        if (!r.id) return;
                        if (membersCache[r.id]) return; // already loaded or loading
                        setMembersCache(prev => ({ ...prev, [r.id]: { loading: true, members: [] } }));
                        try {
                          const ms = await getRoomMembers(auth.token, r.id);
                          setMembersCache(prev => ({ ...prev, [r.id]: { loading: false, members: ms || [] } }));
                        } catch (e) {
                          setMembersCache(prev => ({ ...prev, [r.id]: { loading: false, members: [] } }));
                        }
                      }}
                    >
                      <Chip size="small" label={`${r.memberCount} member${r.memberCount !== 1 ? 's' : ''}`} sx={{ fontSize: '0.7rem' }} />
                    </Tooltip>
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
                      <Button size="small" component={RouterLinkWrapper} to={`/rooms/${r.id}`}>View</Button>
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
        <Button variant="outlined" size="small" component={RouterLinkWrapper} to="/legacy">Legacy</Button>
      </Stack>

      {/* Public room search */}
      <Box sx={{ mt: 1, maxWidth: 560 }}>
        <Autocomplete
          freeSolo
          open={roomSuggestOpen}
          onOpen={() => setRoomSuggestOpen(true)}
          onClose={() => setRoomSuggestOpen(false)}
          options={roomSuggestOptions}
          getOptionLabel={(opt) => typeof opt === 'string' ? opt : (opt.name || '')}
          onInputChange={async (e, newInput) => {
            setRoomSearchValue(newInput);
            if (!newInput || newInput.length < 2) {
              setRoomSuggestOptions([]);
              return;
            }
            setRoomSuggestLoading(true);
            try {
              const opts = await suggestRooms(auth.token, newInput);
              setRoomSuggestOptions(opts || []);
            } catch (err) {
              console.warn('suggestRooms failed', err);
              setRoomSuggestOptions([]);
            } finally {
              setRoomSuggestLoading(false);
            }
          }}
          loading={roomSuggestLoading}
          onChange={(e, newValue) => {
            // If user selected a room object, navigate to it
            if (newValue && typeof newValue === 'object' && newValue.id) {
              nav(`/rooms/${newValue.id}`);
            } else if (typeof newValue === 'string' && newValue.trim()) {
              // If they typed a full room id or name, try to find exact match in suggestions
              const match = (roomSuggestOptions || []).find(r => r.name === newValue || r.id === newValue);
              if (match && match.id) nav(`/rooms/${match.id}`);
            }
            setRoomSearchValue('');
            setRoomSuggestOptions([]);
            setRoomSuggestOpen(false);
          }}
          renderInput={(params) => {
            const { ownerState, ...safeParams } = params || {};
            return (
              <TextField
                {...safeParams}
                label="Search public rooms"
                placeholder="Type to find public rooms"
                InputProps={{
                  ...safeParams.InputProps,
                  endAdornment: (
                    <>
                      {roomSuggestLoading ? <CircularProgress color="inherit" size={20} /> : null}
                      {safeParams.InputProps?.endAdornment}
                    </>
                  )
                }}
              />
            );
          }}
          renderOption={(props, option) => {
            // MUI v6 may include internal props like `ownerState` in the props
            // object passed to renderOption. Stripping it prevents unknown props
            // from being forwarded to DOM elements (which triggers React warnings).
            const { ownerState, ...rest } = props || {};
            return (
              <li {...rest} key={option.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{option.ownerName || ''} · {option.memberCount || 0} members</Typography>
                </Box>
              </li>
            );
          }}
        />
      </Box>

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
      <Dialog open={!!shareOpen} onClose={(e, reason) => {
        // Keep dialog open if there are server-side share errors (user typed nonexistent usernames)
        if (shareErrors && shareErrors.length) {
          // ignore backdropClick or escapeKeyDown closing when errors exist
          return;
        }
        setShareOpen(null); setShareUsers([]); setShareErrors([]);
      }}>
        <DialogTitle>Share room</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>Add users to invite / share with. Select suggestions or type full usernames.</Typography>
          <Autocomplete
            multiple
            freeSolo
            open={suggestOpen}
            onOpen={() => setSuggestOpen(true)}
            onClose={() => setSuggestOpen(false)}
            inputValue={shareInputValue}
            onInputChange={(e, newInput) => setShareInputValue(newInput)}
            options={suggestOptions}
            // value is array of objects; render by username
            value={shareUsers}
            getOptionLabel={(opt) => typeof opt === 'string' ? opt : (opt.username || '')}
            isOptionEqualToValue={(opt, val) => (opt.username || opt) === (val.username || val)}
            loading={suggestLoading}
            onChange={(e, newValue) => {
              // newValue may contain strings or username objects; normalize to {username, role}
              const norm = (newValue || []).map(v => {
                if (typeof v === 'string') return { username: v, role: 'editor' };
                return { username: v.username || '', role: v.role || 'editor' };
              }).filter(x => x.username);
              setShareUsers(norm);
              setShareInputValue('');
              try {
                const remaining = (shareErrors || []).filter(err => norm.some(n => n.username === err.username));
                setShareErrors(remaining);
              } catch (ex) { }
            }}
            filterSelectedOptions
            renderTags={(value, getTagProps) => {
              const errMap = (shareErrors || []).reduce((acc, e) => { acc[e.username] = e; return acc; }, {});
              return value.map((option, index) => {
                // getTagProps may include a `key` property which must NOT be
                // spread into JSX elements (React requires `key` to be passed
                // directly on the element). Destructure to remove `key`.
                const rawTagProps = getTagProps({ index }) || {};
                const { key: _k, ...tagProps } = rawTagProps;
                const err = errMap[option.username];
                return (
                  <Box key={option.username + index} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    {err ? (
                      <Tooltip title={`${err.error || 'user not found.'}`} placement="top">
                        <Chip {...tagProps} label={option.username} color="error" />
                      </Tooltip>
                    ) : (
                      <Chip {...tagProps} label={option.username} />
                    )}
                    <TextField
                      size="small"
                      select
                      value={option.role || 'editor'}
                      onChange={(e) => {
                        const role = e.target.value;
                        setShareUsers(prev => prev.map(p => p.username === option.username ? { ...p, role } : p));
                      }}
                      sx={{ minWidth: 110 }}
                    >
                      <MenuItem value="editor">Editor</MenuItem>
                      <MenuItem value="viewer">Viewer</MenuItem>
                    </TextField>
                  </Box>
                );
              });
            }}
            renderInput={(params) => {
              const { ownerState, ...safeParams } = params || {};
              return (
                <TextField
                  {...safeParams}
                  label="Usernames"
                  fullWidth
                  onChange={async (ev) => {
                    const v = ev.target.value;
                    setShareInputValue(v);
                    // only query when user types at least 2 chars
                    if (!v || v.length < 2) {
                      setSuggestOptions([]);
                      return;
                    }
                    setSuggestLoading(true);
                    try {
                      const opts = await suggestUsers(auth.token, v);
                      setSuggestOptions(opts || []);
                    } catch (err) {
                      console.warn('suggestUsers failed', err);
                      setSuggestOptions([]);
                    } finally {
                      setSuggestLoading(false);
                    }
                  }}
                  InputProps={{
                    ...safeParams.InputProps,
                    endAdornment: (
                      <>
                        {suggestLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {safeParams.InputProps?.endAdornment}
                      </>
                    )
                  }}
                />
              );
            }}
          />
          {shareErrors.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="error">Some usernames were not found:</Typography>
              {shareErrors.map((err, idx) => (
                <Paper key={idx} sx={{ p: 1, mt: 0.5 }}>
                  <Typography variant="body2"><strong>{err.username}</strong>: {err.error}</Typography>
                  {err.suggestions && err.suggestions.length > 0 && (
                    <Typography variant="caption">Suggestions: {err.suggestions.join(', ')}</Typography>
                  )}
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShareOpen(null); setShareUsers([]); setShareErrors([]); setShareInputValue(''); }}>Close</Button>
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
        <SafeSnackbar open={snack.open} message={snack.message} autoHideDuration={4000} onClose={() => setSnack({ open: false, message: '' })} />
        <SafeSnackbar open={shareSuccess.open} message={shareSuccess.message} autoHideDuration={3500} onClose={() => setShareSuccess({ open: false, message: '' })} />
      </Box>
    </Box>
  );
}
