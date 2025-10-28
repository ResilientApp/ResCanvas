
import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Paper, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Chip, Tooltip } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoomDetails, updateRoom, getRoomMembers, updatePermissions, transferOwnership, shareRoom, suggestUsers } from '../api/rooms';
import Autocomplete from '@mui/material/Autocomplete';
import { List, ListItem, ListItemText, IconButton, MenuItem as MMenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

export default function RoomSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [forbiddenOpen, setForbiddenOpen] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState('');
  const [forbiddenRedirect, setForbiddenRedirect] = useState('/dashboard');
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [transferOptions, setTransferOptions] = useState([]);
  const [transferSuggestLoading, setTransferSuggestLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [myUsername, setMyUsername] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteSelected, setInviteSelected] = useState([]);

  const [inviteSelectedSuggestions, setInviteSelectedSuggestions] = useState([]);
  const [inviteSuggestOptions, setInviteSuggestOptions] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteErrors, setInviteErrors] = useState([]);

  const canInvite = Array.isArray(inviteSelected) && (inviteSelected || []).some(u => {
    const uname = (u && (u.username || u)) || '';
    return (inviteSuggestOptions || []).some(opt => ((opt && (opt.username || opt)) === uname));
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await getRoomDetails(null, id);
        setRoom(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setType(data.type || 'public');

        await refreshMembers();
      } catch (e) {
        console.error('Failed to load room settings:', e);
        if (e?.message && e.message.toLowerCase().includes('forbidden')) {
          setForbiddenMessage('You do not have permission to view settings for this room.');
          setForbiddenRedirect('/dashboard');
          setForbiddenOpen(true);
        }
      }
    }
    load();
  }, [id]);

  async function refreshMembers() {
    setLoadingMembers(true);
    try {
      const ms = await getRoomMembers(null, id);
      const all = ms || [];
      setMembers(all);
      try { setTransferOptions((all || []).filter(m => m.role !== 'owner').map(m => m.username || '')); } catch (_) { setTransferOptions([]); }
      try {
        const raw = localStorage.getItem('auth');
        const parsed = raw ? JSON.parse(raw) : null;
        const uname = parsed?.user?.username || parsed?.user?.username;
        setMyUsername(uname || null);
        const mine = all.find(x => x.username === uname);
        const role = mine?.role || null;
        setMyRole(role);
        setIsOwner(role === 'owner');
        setIsEditor(role === 'editor' || role === 'owner');

        if (role === 'viewer') {
          try {
            window.dispatchEvent(new CustomEvent('rescanvas:notify', { detail: { message: 'Viewers cannot access room settings. Redirecting to the room...', duration: 4500 } }));
          } catch (evErr) { console.warn('notify failed', evErr); }

          setTimeout(() => {
            try { navigate(`/rooms/${id}`); } catch (_) { }
          }, 600);
        }
      } catch (e) {
        setMyRole(null); setMyUsername(null); setIsOwner(false); setIsEditor(false);
      }
    } catch (e) {
      console.warn('Failed to load members', e);
      setMembers([]);
      setMyRole(null); setMyUsername(null); setIsOwner(false); setIsEditor(false);
    } finally { setLoadingMembers(false); }
  }

  async function save() {
    try {
      const body = { name, description };
      if (isOwner) body.type = type;
      const res = await updateRoom(null, id, body);

      if (res && res.id) {
        setRoom(prev => ({ ...prev, ...res }));
      } else if (res && res.room) {
        setRoom(res.room);
      }

      setTimeout(() => navigate(`/rooms/${id}`), 250);
    } catch (e) {
      console.error('Failed to save room settings:', e);
      if (e?.message && e.message.toLowerCase().includes('forbidden')) {
        setForbiddenMessage('You do not have permission to change settings for this room.');
        setForbiddenRedirect(`/rooms/${id}`);
        setForbiddenOpen(true);
      }
    }
  }

  async function changeMemberRole(userId, role) {
    try {
      await updatePermissions(null, id, { userId, role });
      await refreshMembers();
    } catch (e) {
      console.error('Failed to change role', e);
      throw e;
    }
  }

  async function kickMember(userId) {
    try {
      await updatePermissions(null, id, { userId });
      await refreshMembers();
    } catch (e) {
      console.error('Failed to remove member', e);
    }
  }

  async function doTransfer() {
    if (!transferTarget) return;
    setTransferLoading(true);
    try {
      await transferOwnership(null, id, transferTarget);

      const data = await getRoomDetails(null, id);
      setRoom(data);
      await refreshMembers();

      try {
        window.dispatchEvent(new CustomEvent('rescanvas:notify', { detail: { message: `Ownership transferred to ${transferTarget}`, duration: 4000 } }));
      } catch (evErr) {
        console.log('notify dispatch failed', evErr);
      }
      setTransferTarget('');
    } catch (e) {
      console.error('Transfer failed', e);
      try {
        window.dispatchEvent(new CustomEvent('rescanvas:notify', { detail: { message: 'Transfer failed: ' + (e?.message || e), duration: 6000 } }));
      } catch (evErr) {
        console.log('notify dispatch failed', evErr);
      }
      throw e;
    } finally {
      setTransferLoading(false);
    }
  }

  if (!room) return <Typography>Loading...</Typography>;

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 260px)', overflow: 'auto' }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Settings for {room.name}</Typography>
        <Tooltip title={isEditor ? '' : 'Only owners and editors may change name'}>
          <span>
            <TextField label="Name" value={name} onChange={e => setName(e.target.value)} fullWidth sx={{ my: 1 }} disabled={!isEditor} />
          </span>
        </Tooltip>
        <Tooltip title={isEditor ? '' : 'Only owners and editors may change description'}>
          <span>
            <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth sx={{ my: 1 }} disabled={!isEditor} />
          </span>
        </Tooltip>
        <Tooltip title={isOwner ? '' : 'Only owners may change room type'}>
          <span>
            <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth sx={{ my: 1 }} disabled={!isOwner}>
              <MenuItem value="public">Public</MenuItem>
              <MenuItem value="private">Private</MenuItem>
              <MenuItem value="secure">Secure</MenuItem>
            </TextField>
          </span>
        </Tooltip>

        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Tooltip title={isEditor ? '' : 'Only owners and editors may save changes'}>
            <span>
              <Button variant="contained" onClick={save} disabled={!isEditor}>Save</Button>
            </span>
          </Tooltip>
          <Button variant="outlined" onClick={() => navigate(`/rooms/${id}`)}>Cancel</Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mt: 2, maxWidth: '100%' }}>
        <Typography variant="h6">Members</Typography>
        {loadingMembers ? <Typography>Loading members...</Typography> : (
          <List>
            {members.map(m => (
              <ListItem key={m.userId} secondaryAction={(
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {m.role !== 'owner' && (
                    myRole === 'viewer' ? (
                      <Tooltip title="Viewers cannot change member roles">
                        <span>
                          <TextField size="small" select value={m.role || 'editor'} sx={{ minWidth: 120, mr: 1 }} disabled />
                        </span>
                      </Tooltip>
                    ) : (
                      <TextField
                        size="small"
                        select
                        value={m.role || 'editor'}
                        onChange={(e) => changeMemberRole(m.userId, e.target.value)}
                        sx={{ minWidth: 120, mr: 1 }}
                      />
                    )
                  )}

                  {m.role !== 'owner' && (
                    myRole === 'viewer' ? (
                      <Tooltip title="Viewers cannot remove members">
                        <span>
                          <IconButton edge="end" aria-label="kick" disabled>
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <IconButton edge="end" aria-label="kick" onClick={() => kickMember(m.userId)}>
                        <DeleteIcon />
                      </IconButton>
                    )
                  )}
                </Box>
              )}>
                <ListItemText primary={m.username} secondary={m.role} />
              </ListItem>
            ))}
          </List>
        )}

        {room.type !== 'public' && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2">Invite users to this private/secure room</Typography>
            <Autocomplete
              multiple
              freeSolo
              open={inviteOpen}
              onOpen={() => setInviteOpen(true)}
              onClose={() => setInviteOpen(false)}
              disabled={myRole === 'viewer'}
              inputValue={inviteInput}
              onInputChange={(e, v) => setInviteInput(v)}
              options={inviteSuggestOptions}
              value={inviteSelected}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : (opt.username || '')}
              isOptionEqualToValue={(opt, val) => (opt.username || opt) === (val.username || val)}
              loading={inviteLoading}
              onChange={(e, newValue) => {
                try {
                  const selectedFromSuggest = (newValue || []).filter(v => typeof v !== 'string').map(v => (v && (v.username || v)) || '');
                  setInviteSelectedSuggestions(selectedFromSuggest.filter(Boolean));
                } catch (_) { setInviteSelectedSuggestions([]); }

                const norm = (newValue || []).map(v => typeof v === 'string' ? { username: v, role: 'editor' } : { username: v.username || '', role: v.role || 'editor' }).filter(x => x.username);
                setInviteSelected(norm);
                setInviteInput('');
                try { const remaining = (inviteErrors || []).filter(err => norm.some(n => n.username === err.username)); setInviteErrors(remaining); } catch (_) { }
              }}
              filterSelectedOptions
              renderTags={(value, getTagProps) => {
                const errMap = (inviteErrors || []).reduce((acc, e) => { acc[e.username] = e; return acc; }, {});
                return value.map((option, index) => {
                  const tagProps = getTagProps({ index }) || {};
                  const { key: _tagKey, ...tagPropsSafe } = tagProps;
                  const err = errMap[option.username];
                  return (
                    <Box key={option.username + index} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      {err ? (
                        <Tooltip title={`${err.error || 'user not found.'}`} placement="top">
                          <Chip {...tagPropsSafe} label={option.username} color="error" />
                        </Tooltip>
                      ) : (
                        <Chip {...tagPropsSafe} label={option.username} />
                      )}
                      <TextField
                        size="small"
                        select
                        value={option.role || 'editor'}
                        onChange={(e) => setInviteSelected(prev => prev.map(p => p.username === option.username ? { ...p, role: e.target.value } : p))}
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
                const { ownerState, sx, className, ...safeParams } = params || {};
                return (
                  <TextField
                    {...safeParams}
                    label="Usernames"
                    fullWidth
                    onChange={async (ev) => {
                      const v = ev.target.value;
                      setInviteInput(v);
                      if (!v || v.length < 2) { setInviteSuggestOptions([]); return; }
                      setInviteLoading(true);
                      try {
                        const opts = await suggestUsers(null, v);
                        setInviteSuggestOptions(opts || []);
                      } catch (err) { console.warn('suggestUsers failed', err); setInviteSuggestOptions([]); }
                      finally { setInviteLoading(false); }
                    }}
                    InputProps={{
                      ...safeParams.InputProps,
                      endAdornment: (
                        <>
                          {inviteLoading ? <CircularProgress color="inherit" size={20} /> : null}
                          {safeParams.InputProps?.endAdornment}
                        </>
                      )
                    }}
                  />
                );
              }}
            />
            <Box sx={{ mt: 1 }}>
              <Button
                variant="outlined"
                onClick={async () => {
                  let users = inviteSelected.slice();
                  if (inviteInput && inviteInput.trim()) users.push({ username: inviteInput.trim(), role: 'editor' });
                  if (!users.length) return;
                  try {
                    const resp = await shareRoom(null, id, users);
                    const res = resp && resp.results ? resp.results : {};
                    const errors = res.errors || [];
                    setInviteErrors(errors);
                    if (!errors.length) {
                      setInviteSelected([]); setInviteInput('');
                      await refreshMembers();
                    } else {
                      const succeeded = (res.invited || []).map(i => i.username).concat((res.updated || []).map(i => i.username));
                      if (succeeded.length) {
                        await refreshMembers();
                      }
                    }
                  } catch (e) { console.error('Invite failed', e); alert('Invite failed: ' + (e?.message || e)); }
                }}
                disabled={!canInvite}
              >Send invites / Add to room</Button>
            </Box>
            {inviteErrors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="error">Some usernames had errors:</Typography>
                {inviteErrors.map((err, idx) => (
                  <Paper key={idx} sx={{ p: 1, mt: 0.5 }}>
                    <Typography variant="body2"><strong>{err.username}</strong>: {err.error}</Typography>
                    {err.suggestions && err.suggestions.length > 0 && (<Typography variant="caption">Suggestions: {err.suggestions.join(', ')}</Typography>)}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">Transfer ownership</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={isOwner ? '' : 'Only the room owner may transfer ownership'}>
              <span>
                <Autocomplete
                  freeSolo
                  size="small"
                  disabled={!isOwner}
                  options={transferOptions}
                  value={transferTarget || null}
                  inputValue={transferInput}
                  onInputChange={async (e, v) => {
                    setTransferInput(v);
                    if (!v || v.length < 2) {
                      setTransferOptions((members || []).filter(m => m.role !== 'owner').map(m => m.username || ''));
                      setTransferSuggestLoading(false);
                      return;
                    }
                    setTransferSuggestLoading(true);
                    try {
                      const opts = await suggestUsers(null, v);
                      const names = (opts || []).map(o => (o && (o.username || o)) || '').filter(Boolean);
                      const memberNames = (members || []).filter(m => m.role !== 'owner').map(m => m.username || '');
                      const combined = Array.from(new Set(memberNames.concat(names)));
                      setTransferOptions(combined);
                    } catch (err) {
                      console.warn('suggestUsers failed', err);
                      setTransferOptions((members || []).filter(m => m.role !== 'owner').map(m => m.username || ''));
                    } finally {
                      setTransferSuggestLoading(false);
                    }
                  }}
                  openOnFocus
                  autoHighlight
                  onChange={(e, v) => {
                    if (!v) { setTransferTarget(''); setTransferInput(''); return; }
                    const value = typeof v === 'string' ? v : (v && (v.username || ''));
                    setTransferTarget(value || '');
                    setTransferInput(value || '');
                  }}
                  filterOptions={(options, state) => {
                    const input = ((state.inputValue || '') + '').trim().toLowerCase();
                    if (!input) return options;
                    return options.filter(o => ((o || '') + '').toLowerCase().includes(input));
                  }}
                  sx={{ minWidth: 220, mr: 1, maxWidth: 360 }}
                  renderInput={(params) => {
                    const { ownerState, sx, className, ...safeParams } = params || {};
                    return (
                      <TextField
                        {...safeParams}
                        label="New owner"
                        placeholder="Type to search..."
                        size="small"
                        InputProps={{
                          ...(safeParams && safeParams.InputProps ? safeParams.InputProps : {}),
                          endAdornment: (
                            <>
                              {transferSuggestLoading ? <CircularProgress color="inherit" size={20} /> : null}
                              {safeParams.InputProps?.endAdornment}
                            </>
                          )
                        }}
                      />
                    );
                  }}
                />
              </span>
            </Tooltip>
            <Tooltip title={isOwner ? '' : 'Only the room owner may transfer ownership'}>
              <span>
                <Button variant="contained" color="primary" onClick={() => setTransferConfirmOpen(true)} disabled={!isOwner || transferLoading || !(transferTarget && transferTarget.trim())} sx={{ height: 36 }}>
                  {transferLoading ? 'Transferring...' : 'Transfer'}
                </Button>
              </span>
            </Tooltip>
          </Box>
          <Dialog open={transferConfirmOpen} onClose={() => setTransferConfirmOpen(false)}>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogContent>
              <Typography>Are you sure you want to transfer ownership of <strong>{room.name}</strong> to <strong>{transferTarget}</strong>? This will make them the new owner and downgrade you to an editor.</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setTransferConfirmOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={async () => {
                  setTransferConfirmOpen(false);
                  try {
                    await doTransfer();
                  } catch (e) {
                  }
                }}
                disabled={transferLoading}
              >
                {transferLoading ? 'Transferring...' : 'Confirm'}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Paper>

      <Dialog open={forbiddenOpen} onClose={() => { setForbiddenOpen(false); navigate(forbiddenRedirect); }}>
        <DialogTitle>Access denied</DialogTitle>
        <DialogContent>
          <Typography>{forbiddenMessage || 'You do not have permission to access the settings for this room.'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setForbiddenOpen(false); navigate(forbiddenRedirect); }}>OK</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
