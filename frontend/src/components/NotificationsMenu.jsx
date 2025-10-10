import React, { useEffect, useState } from 'react';
import { IconButton, Badge, Menu, MenuItem, ListItemText, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Box, Typography } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { listNotifications, markNotificationRead, acceptInvite, declineInvite, listInvites, deleteNotification, clearNotifications } from '../api/rooms';
import { onNotification, getSocket, setSocketToken } from '../services/socket';
import { handleAuthError } from '../utils/authUtils';

export default function NotificationsMenu({ auth }) {
  const [anchor, setAnchor] = useState(null);
  const [items, setItems] = useState([]);
  const unread = items.filter(i => !i.read).length;
  const [highlightedIds, setHighlightedIds] = useState(new Set());

  async function refresh() {
    if (!auth?.token) return;
    try {
      const res = await listNotifications(auth.token);
      setItems(res);
      // highlight unread items
      const unreadIds = new Set((res || []).filter(r => !r.read).map(r => r.id));
      setHighlightedIds(unreadIds);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      handleAuthError(err);
    }
  }

  useEffect(() => {
    refresh();
    if (!auth?.token) return;
    const off = onNotification((n) => {
      const id = n.id || Math.random().toString(36).slice(2);
      // new notifications are highlighted (unread)
      setItems(prev => [{ ...n, id }, ...prev]);
      setHighlightedIds(prev => new Set(Array.from(prev).concat([id])));
    });
    setSocketToken(auth.token);
    getSocket(auth.token);
    return off;
  }, [auth?.token]);

  async function handleOpen(e) {
    setAnchor(e.currentTarget);
    await refresh();
  }

  function handleClose() { setAnchor(null); }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeNotif, setActiveNotif] = useState(null);

  async function handleNotifClick(n) {
    if (n.type === 'invite') {
      try {
        const invites = await listInvites(auth.token);
        const roomId = (n?.link || '').split('/').pop();
        const inv = (invites || []).find(i => i.roomId === roomId && i.status === 'pending');
        if (!inv) {
          // No pending invite: mark related invite notifications as read so the dialog won't re-open
          try { await _markInviteNotificationsReadByRoom(roomId); } catch (err) { console.error('mark read by room failed', err); }
          await refresh();
          return;
        }
        // There is a pending invite: open dialog and attach resolved invite id so accept/decline can act directly
        setActiveNotif({ ...n, relatedId: inv.id });
        setDialogOpen(true);
        return;
      } catch (err) {
        console.error('failed to resolve invite for notification click', err);
        return;
      }
    }
    // For other notifications: mark as read (dismiss/unhighlight) but do NOT redirect.
    try {
      if (!n.read) {
        await markNotificationRead(auth.token, n.id);
        setItems(prev => prev.map(it => it.id === n.id ? { ...it, read: true } : it));
      }
    } catch (e) { console.error('mark read failed', e); }
    setHighlightedIds(prev => { const s = new Set(Array.from(prev)); s.delete(n.id); return s; });
  }

  async function handleDelete(n) {
    try {
      await deleteNotification(auth.token, n.id);
      setItems(prev => prev.filter(it => it.id !== n.id));
      setHighlightedIds(prev => { const s = new Set(Array.from(prev)); s.delete(n.id); return s; });
    } catch (e) { console.error('delete failed', e); }
  }

  async function handleClearAll() {
    try {
      await clearNotifications(auth.token);
      setItems([]);
      setHighlightedIds(new Set());
    } catch (e) { console.error('clear all failed', e); }
  }

  async function _resolveInviteId() {
    // notifications don't include the invite id, so fetch pending invites and match by room id
    try {
      const invites = await listInvites(auth.token);
      const roomId = (activeNotif?.link || '').split('/').pop();
      const inv = invites.find(i => i.roomId === roomId && i.status === 'pending');
      return inv?.id;
    } catch (e) {
      console.error('failed to list invites', e);
      return null;
    }
  }

  async function _markInviteNotificationsReadByRoom(roomId) {
    if (!roomId) return;
    try {
      const notifs = await listNotifications(auth.token);
      const matches = (notifs || []).filter(n => n.type === 'invite' && (n.link || '').endsWith(`/${roomId}`) && !n.read);
      for (const m of matches) {
        try { await markNotificationRead(auth.token, m.id); } catch (err) { console.error('mark read by room failed for', m.id, err); }
      }
      const matchIds = new Set(matches.map(m => m.id));
      setItems(prev => prev.map(it => matchIds.has(it.id) ? { ...it, read: true } : it));
      setHighlightedIds(prev => { const s = new Set(Array.from(prev)); matchIds.forEach(id => s.delete(id)); return s; });
    } catch (e) {
      console.error('failed to mark invite notifications by room', e);
    }
  }

  async function doAccept() {
    try {
      const iid = activeNotif?.relatedId || await _resolveInviteId();
      if (!iid) throw new Error('invite id not found');
      await acceptInvite(auth.token, iid);
    } catch (e) { console.error('accept failed', e); }
    // Mark the notification(s) for this room as read so they are dismissed and won't reopen the dialog
    try {
      const roomId = (activeNotif?.link || '').split('/').pop();
      await _markInviteNotificationsReadByRoom(roomId);
    } catch (err) { console.error('mark read after accept failed', err); }
    setDialogOpen(false); setActiveNotif(null); await refresh();
    // Let other UI (e.g., Dashboard) know rooms/invites changed so they can refresh
    try { window.dispatchEvent(new Event('rescanvas:rooms-updated')); } catch (ex) { /* ignore */ }
  }

  async function doDecline() {
    try {
      const iid = activeNotif?.relatedId || await _resolveInviteId();
      if (!iid) throw new Error('invite id not found');
      await declineInvite(auth.token, iid);
    } catch (e) { console.error('decline failed', e); }
    try {
      const roomId = (activeNotif?.link || '').split('/').pop();
      await _markInviteNotificationsReadByRoom(roomId);
    } catch (err) { console.error('mark read after decline failed', err); }
    setDialogOpen(false); setActiveNotif(null); await refresh();
  }

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.12)', transform: 'translateY(-1px)' }, transition: 'all 120ms ease' }}>
        <Badge badgeContent={unread} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={handleClose} PaperProps={{ sx: { width: 520, maxHeight: 600 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
          <Typography variant="subtitle1">Notifications</Typography>
          <Button size="small" onClick={handleClearAll} disabled={items.length === 0}>Clear all</Button>
        </Box>
        {items.length === 0 && <MenuItem disabled>No notifications</MenuItem>}
        {items.map((n, idx) => (
          <React.Fragment key={n.id || idx}>
            <MenuItem sx={{ alignItems: 'flex-start', whiteSpace: 'normal', bgcolor: (!n.read || highlightedIds.has(n.id)) ? 'rgba(25,118,210,0.06)' : 'inherit' }}>
              <Box sx={{ flex: 1 }} onClick={() => handleNotifClick(n)}>
                <ListItemText primary={n.message} secondary={new Date(n.createdAt).toLocaleString()} sx={{ whiteSpace: 'normal' }} />
              </Box>
              <Box sx={{ ml: 1, display: 'flex', alignItems: 'flex-start' }}>
                <IconButton size="small" onClick={() => handleDelete(n)} aria-label="delete-notification" sx={{ ml: 1 }}>
                  ✕
                </IconButton>
              </Box>
            </MenuItem>
            {idx < items.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Invitation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {activeNotif?.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={doDecline}>Decline</Button>
          <Button onClick={doAccept} variant="contained">Accept</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
