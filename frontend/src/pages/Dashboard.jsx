import React, { useEffect, useState, useMemo } from 'react';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Divider, CircularProgress, Tooltip, MenuItem, Pagination, IconButton } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import GroupIcon from '@mui/icons-material/Group';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EditIcon from '@mui/icons-material/Edit';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import SafeSnackbar from '../components/SafeSnackbar';
import Autocomplete from '@mui/material/Autocomplete';
import { listRooms, createRoom, shareRoom, listInvites, acceptInvite, declineInvite, updateRoom, suggestUsers, suggestRooms, getRoomMembers } from '../api/rooms';
import { getUsername } from '../utils/getUsername';
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
  // track which usernames were selected from suggestion objects (not free-typed strings)
  const [shareSelectedSuggestions, setShareSelectedSuggestions] = useState([]);
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
  // client-side 'hide' feature removed
  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(null); // owner-only permanent delete
  const [destructiveConfirmText, setDestructiveConfirmText] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '' });

  // Room sort options: key and order
  // per-section sort options
  const [publicSortKey, setPublicSortKey] = useState(() => localStorage.getItem('rescanvas:publicSortKey') || 'updatedAt');
  const [publicSortOrder, setPublicSortOrder] = useState(() => localStorage.getItem('rescanvas:publicSortOrder') || 'desc');
  const [privateSortKey, setPrivateSortKey] = useState(() => localStorage.getItem('rescanvas:privateSortKey') || 'updatedAt');
  const [privateSortOrder, setPrivateSortOrder] = useState(() => localStorage.getItem('rescanvas:privateSortOrder') || 'desc');
  const [secureSortKey, setSecureSortKey] = useState(() => localStorage.getItem('rescanvas:secureSortKey') || 'updatedAt');
  const [secureSortOrder, setSecureSortOrder] = useState(() => localStorage.getItem('rescanvas:secureSortOrder') || 'desc');
  const [archivedSortKey, setArchivedSortKey] = useState(() => localStorage.getItem('rescanvas:archivedSortKey') || 'updatedAt');
  const [archivedSortOrder, setArchivedSortOrder] = useState(() => localStorage.getItem('rescanvas:archivedSortOrder') || 'desc');
  // Backwards-compat aliases: some code (or older bundles) may still reference
  // global `sortKey`/`sortOrder`. Provide lightweight aliases to avoid
  // ReferenceError and keep behaviour consistent (default to public section).
  const sortKey = publicSortKey;
  const sortOrder = publicSortOrder;
  // Pagination
  // Global pagination state removed — using per-section pagination (public/private/secure/archived)
  // per-section pagination state
  const [publicPage, setPublicPage] = useState(1);
  const [privatePage, setPrivatePage] = useState(1);
  const [securePage, setSecurePage] = useState(1);
  const [publicPerPage, setPublicPerPage] = useState(() => Number(localStorage.getItem('rescanvas:publicPerPage')) || 20);
  const [privatePerPage, setPrivatePerPage] = useState(() => Number(localStorage.getItem('rescanvas:privatePerPage')) || 20);
  const [securePerPage, setSecurePerPage] = useState(() => Number(localStorage.getItem('rescanvas:securePerPage')) || 20);
  const [publicTotal, setPublicTotal] = useState(0);
  const [privateTotal, setPrivateTotal] = useState(0);
  const [secureTotal, setSecureTotal] = useState(0);
  // archived pagination and totals
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedPerPage, setArchivedPerPage] = useState(() => Number(localStorage.getItem('rescanvas:archivedPerPage')) || 20);
  const [archivedTotal, setArchivedTotal] = useState(0);

  async function refresh() {
    if (!auth?.token) return;
    try {
      // Fetch active rooms (per-section) and archived rooms in parallel with hidden list
      const pubP = listRooms(auth.token, { includeArchived: false, sortBy: publicSortKey, order: publicSortOrder, page: publicPage, per_page: publicPerPage, type: 'public' });
      const priP = listRooms(auth.token, { includeArchived: false, sortBy: privateSortKey, order: privateSortOrder, page: privatePage, per_page: privatePerPage, type: 'private' });
      const secP = listRooms(auth.token, { includeArchived: false, sortBy: secureSortKey, order: secureSortOrder, page: securePage, per_page: securePerPage, type: 'secure' });
      const archivedP = listRooms(auth.token, { includeArchived: true, sortBy: archivedSortKey, order: archivedSortOrder, page: archivedPage, per_page: archivedPerPage });

      const [pubRes, priRes, secRes, archivedRes] = await Promise.all([pubP, priP, secP, archivedP]);

      const pubRooms = pubRes?.rooms || [];
      const priRooms = priRes?.rooms || [];
      const secRooms = secRes?.rooms || [];
      const archivedAll = archivedRes?.rooms || [];

      // Trust server-side visibility and archived filtering. Backend now
      // returns only the requested visibility set (archived vs active), so
      // avoid additional client-side filtering which caused mismatches.
      const visiblePublic = pubRooms;
      const visiblePrivate = priRooms;
      const visibleSecure = secRooms;
      const visibleArchived = archivedAll;

      // Update section states
      // Combine section arrays but deduplicate by room id to avoid duplicate React keys
      const combined = [...visiblePublic, ...visiblePrivate, ...visibleSecure];
      const dedupMap = new Map();
      for (const r of combined) {
        if (!r || !r.id) continue;
        if (!dedupMap.has(r.id)) dedupMap.set(r.id, r);
      }
      const dedupedRooms = Array.from(dedupMap.values());
      setRooms(dedupedRooms);
      // Prefer server-provided totals (for correct pagination). Fall back to visible lengths.
      setPublicTotal((pubRes && typeof pubRes.total === 'number') ? pubRes.total : pubRooms.length);
      setPrivateTotal((priRes && typeof priRes.total === 'number') ? priRes.total : priRooms.length);
      setSecureTotal((secRes && typeof secRes.total === 'number') ? secRes.total : secRooms.length);
      setArchivedRooms(visibleArchived);
      setArchivedTotal((archivedRes && typeof archivedRes.total === 'number') ? archivedRes.total : archivedAll.length);

      setInvites(await listInvites(auth.token));
    } catch (error) {
      console.error('Dashboard refresh failed:', error);
      handleAuthError(error);
    }
  }
  useEffect(() => { refresh(); }, [auth?.token]);
  useEffect(() => { refresh(); }, [publicSortKey, publicSortOrder, privateSortKey, privateSortOrder, secureSortKey, secureSortOrder, archivedSortKey, archivedSortOrder, publicPage, privatePage, securePage, archivedPage, publicPerPage, privatePerPage, securePerPage, archivedPerPage]);
  useEffect(() => {
    function onRoomsUpdated() { refresh(); }
    window.addEventListener('rescanvas:rooms-updated', onRoomsUpdated);
    return () => window.removeEventListener('rescanvas:rooms-updated', onRoomsUpdated);
  }, []);

  // Persist sort preferences
  useEffect(() => {
    try { localStorage.setItem('rescanvas:publicSortKey', publicSortKey); } catch (e) { }
    try { localStorage.setItem('rescanvas:publicSortOrder', publicSortOrder); } catch (e) { }
    try { localStorage.setItem('rescanvas:privateSortKey', privateSortKey); } catch (e) { }
    try { localStorage.setItem('rescanvas:privateSortOrder', privateSortOrder); } catch (e) { }
    try { localStorage.setItem('rescanvas:secureSortKey', secureSortKey); } catch (e) { }
    try { localStorage.setItem('rescanvas:secureSortOrder', secureSortOrder); } catch (e) { }
    try { localStorage.setItem('rescanvas:archivedSortKey', archivedSortKey); } catch (e) { }
    try { localStorage.setItem('rescanvas:archivedSortOrder', archivedSortOrder); } catch (e) { }
    try { localStorage.setItem('rescanvas:publicPerPage', String(publicPerPage)); } catch (e) { }
    try { localStorage.setItem('rescanvas:privatePerPage', String(privatePerPage)); } catch (e) { }
    try { localStorage.setItem('rescanvas:securePerPage', String(securePerPage)); } catch (e) { }
    try { localStorage.setItem('rescanvas:archivedPerPage', String(archivedPerPage)); } catch (e) { }
  }, [publicSortKey, publicSortOrder, privateSortKey, privateSortOrder, secureSortKey, secureSortOrder, archivedSortKey, archivedSortOrder, publicPerPage, privatePerPage, securePerPage, archivedPerPage]);

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

  // Only allow sharing when at least one of the selected users matches an actual suggestion option
  const canShare = Array.isArray(shareUsers) && (shareUsers || []).some(u => {
    const uname = (u && (u.username || u)) || '';
    return (suggestOptions || []).some(opt => ((opt && (opt.username || opt)) === uname));
  });

  const handleShareLink = (roomId) => {
    setShareLinkOpen(roomId);
  };

  function Section({ title, items, page = 1, perPage = 20, total = 0, onPageChange, onPerPageChange, sortKey, sortOrder, onSortKeyChange, onSortOrderToggle }) {
    // show section even if empty so users can change pagination
    const allowedPageSizes = [10, 20, 50, 100];
    const safePerPage = allowedPageSizes.includes(perPage) ? perPage : 20;
    const safePage = (typeof page === 'number' && page > 0) ? page : 1;
    const safeTotal = (typeof total === 'number') ? total : 0;
    const handlePerPage = typeof onPerPageChange === 'function' ? onPerPageChange : (() => { });
    const handlePage = typeof onPageChange === 'function' ? onPageChange : (() => { });

    // compute a clear page range label like "1–10 of 11" instead of confusing
    // "10 / 11 visible" which mixes page size with total counts.
    const startIndex = (typeof safeTotal === 'number' && safeTotal > 0) ? ((safePage - 1) * safePerPage) + 1 : 0;
    const endIndex = (typeof safeTotal === 'number' && safeTotal > 0) ? Math.min(safeTotal, safePage * safePerPage) : 0;
    const pageRangeLabel = (safeTotal > 0) ? `${startIndex}${startIndex === endIndex ? '' : '–' + endIndex} of ${safeTotal}` : `${safeTotal} total`;

    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="overline" sx={{ opacity: 0.7 }}>{title}</Typography>
          <Box sx={{ flex: 1 }} />
          {typeof safeTotal === 'number' && (
            <Typography variant="caption" color="text.secondary">
              {pageRangeLabel}
            </Typography>
          )}

          {/* per-section sort controls */}
          <Typography variant="caption" sx={{ opacity: 0.7, ml: 1 }}>Sort:</Typography>
          <TextField
            size="small"
            select
            value={sortKey}
            onChange={(e) => onSortKeyChange && onSortKeyChange(e.target.value)}
            sx={{ minWidth: 180, ml: 0.5 }}
          >
            <MenuItem value="updatedAt"><Stack direction="row" spacing={1} alignItems="center"><EditIcon fontSize="small" /> <Typography variant="body2">Last edited</Typography></Stack></MenuItem>
            <MenuItem value="createdAt"><Stack direction="row" spacing={1} alignItems="center"><CalendarTodayIcon fontSize="small" /> <Typography variant="body2">Created</Typography></Stack></MenuItem>
            <MenuItem value="name"><Stack direction="row" spacing={1} alignItems="center"><SortByAlphaIcon fontSize="small" /> <Typography variant="body2">Name (A → Z)</Typography></Stack></MenuItem>
            <MenuItem value="memberCount"><Stack direction="row" spacing={1} alignItems="center"><GroupIcon fontSize="small" /> <Typography variant="body2">Members</Typography></Stack></MenuItem>
          </TextField>
          <IconButton size="small" onClick={() => onSortOrderToggle && onSortOrderToggle()} aria-label="toggle-sort-order">
            {sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
          </IconButton>

          <TextField select size="small" value={String(safePerPage)} onChange={(e) => handlePerPage(Number(e.target.value))} sx={{ width: 110, ml: 1 }}>
            <MenuItem value={10}>10 / page</MenuItem>
            <MenuItem value={20}>20 / page</MenuItem>
            <MenuItem value={50}>50 / page</MenuItem>
            <MenuItem value={100}>100 / page</MenuItem>
          </TextField>
          <Pagination count={Math.max(1, Math.ceil((safeTotal || 0) / safePerPage))} page={safePage} onChange={(e, v) => handlePage(v)} size="small" sx={{ ml: 1 }} />
        </Stack>
        <Stack sx={{ mt: 0.5 }} spacing={0.5}>
          {items.map(r => {
            const isOwner = (() => {
              if (r.myRole === 'owner') return true;
              try {
                const uname = getUsername(auth);
                return !!(uname && r.ownerName && uname === r.ownerName);
              } catch (e) { return false; }
            })();
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
                  {/* created/updated timestamps */}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {r.updatedAt && <Typography variant="caption" color="text.secondary">Last edited: {new Date(r.updatedAt).toLocaleString()}</Typography>}
                    {r.createdAt && <Typography variant="caption" color="text.secondary">Created: {new Date(r.createdAt).toLocaleString()}</Typography>}
                  </Stack>
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

  // Defensive filtering: ensure public section only shows rooms user is a member/owner of.
  const grouped = {
    // Rely on server-side visibility rules. Backend now excludes hidden rooms
    // and returns only owned/shared public rooms when requested.
    public: rooms.filter(r => r.type === 'public'),
    private: rooms.filter(r => r.type === 'private'),
    secure: rooms.filter(r => r.type === 'secure'),
    // archivedRooms is provided by the server and already contains only archived entries
    archived: archivedRooms
  };
  // server-side sorted groups are provided by API; use grouped directly
  const groupedSorted = grouped;

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
      <Section
        title="Public Rooms"
        items={groupedSorted.public}
        page={publicPage}
        perPage={publicPerPage}
        total={publicTotal}
        onPageChange={(v) => setPublicPage(v)}
        onPerPageChange={(v) => { setPublicPerPage(v); setPublicPage(1); }}
        sortKey={publicSortKey}
        sortOrder={publicSortOrder}
        onSortKeyChange={(k) => { setPublicSortKey(k); setPublicPage(1); }}
        onSortOrderToggle={() => { setPublicSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setPublicPage(1); }}
      />
      <Section
        title="Private Rooms"
        items={groupedSorted.private}
        page={privatePage}
        perPage={privatePerPage}
        total={privateTotal}
        onPageChange={(v) => setPrivatePage(v)}
        onPerPageChange={(v) => { setPrivatePerPage(v); setPrivatePage(1); }}
        sortKey={privateSortKey}
        sortOrder={privateSortOrder}
        onSortKeyChange={(k) => { setPrivateSortKey(k); setPrivatePage(1); }}
        onSortOrderToggle={() => { setPrivateSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setPrivatePage(1); }}
      />
      <Section
        title="Secure Rooms"
        items={groupedSorted.secure}
        page={securePage}
        perPage={securePerPage}
        total={secureTotal}
        onPageChange={(v) => setSecurePage(v)}
        onPerPageChange={(v) => { setSecurePerPage(v); setSecurePage(1); }}
        sortKey={secureSortKey}
        sortOrder={secureSortOrder}
        onSortKeyChange={(k) => { setSecureSortKey(k); setSecurePage(1); }}
        onSortOrderToggle={() => { setSecureSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setSecurePage(1); }}
      />
      <Section
        title="Archived Rooms"
        items={groupedSorted.archived}
        page={archivedPage}
        perPage={archivedPerPage}
        total={archivedTotal}
        onPageChange={(v) => setArchivedPage(v)}
        onPerPageChange={(v) => { setArchivedPerPage(v); setArchivedPage(1); }}
        sortKey={archivedSortKey}
        sortOrder={archivedSortOrder}
        onSortKeyChange={(k) => { setArchivedSortKey(k); setArchivedPage(1); }}
        onSortOrderToggle={() => { setArchivedSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setArchivedPage(1); }}
      />

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
              // Track which selections came from suggestion objects (objects vs free-typed strings)
              try {
                const selectedFromSuggest = (newValue || []).filter(v => typeof v !== 'string').map(v => (v && (v.username || v)) || '');
                setShareSelectedSuggestions(selectedFromSuggest.filter(Boolean));
              } catch (_) { setShareSelectedSuggestions([]); }

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
          <Button onClick={() => { setShareOpen(null); setShareUsers([]); setShareErrors([]); setShareInputValue(''); setShareSelectedSuggestions([]); }}>Close</Button>
          {/* Only enable Share when at least one suggestion was selected or a non-empty typed username exists */}
          <Button onClick={doShare} variant="contained" disabled={!canShare}>Share</Button>
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
              // Use the server leave API for all room types. Prefer the server
              // to tell us whether membership was actually removed by returning
              // a { removed: true|false } flag.
              try {
                const mod = await import('../api/rooms');
                const resp = await mod.leaveRoom(auth.token, roomId);
                // If server explicitly indicates removal, show appropriate message.
                if (resp && typeof resp.removed === 'boolean') {
                  if (resp.removed) setSnack({ open: true, message: 'Left room' });
                  else setSnack({ open: true, message: 'Room removed from your lists' });
                } else {
                  // Backwards compatibility: assume success means left.
                  setSnack({ open: true, message: 'Left room' });
                }
              } catch (e) {
                console.error('Leave room failed', e);
                if (e?.message && e.message.toLowerCase().includes('owner')) {
                  setSnack({ open: true, message: 'You must transfer ownership before leaving this room.' });
                } else {
                  setSnack({ open: true, message: 'Failed to leave room: ' + (e?.message || e) });
                }
              }
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

      {/* 'Hide archived room' feature removed */}

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
