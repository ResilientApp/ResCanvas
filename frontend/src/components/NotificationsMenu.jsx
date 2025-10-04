import React, { useEffect, useState } from 'react';
import { IconButton, Badge, Menu, MenuItem, ListItemText, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { listNotifications, markNotificationRead, acceptInvite, declineInvite, listInvites } from '../api/rooms';
import { onNotification, getSocket, setSocketToken } from '../socket';
import { handleAuthError } from '../utils/authUtils';

export default function NotificationsMenu({ auth }) {
  const [anchor, setAnchor] = useState(null);
  const [items, setItems] = useState([]);
  const unread = items.filter(i => !i.read).length;

  async function refresh() {
    if (!auth?.token) return;
    try {
      const res = await listNotifications(auth.token);
      setItems(res);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      handleAuthError(err);
    }
  }

  useEffect(() => {
    refresh();
    if (!auth?.token) return;
    const off = onNotification((n) => {
      setItems(prev => [{ ...n, id: n.id || Math.random().toString(36).slice(2) }, ...prev]);
    });
    setSocketToken(auth.token);
    getSocket(auth.token); // ensure socket alive
    return off;
  }, [auth?.token]);

  async function handleOpen(e) {
    setAnchor(e.currentTarget);
    await refresh();
    // mark all unread as read when opening
    for (const it of items) {
      if (!it.read) {
        try { await markNotificationRead(auth.token, it.id); } catch (_) { }
      }
    }
  }

  function handleClose() { setAnchor(null); }

  // Dialog for invite details
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeNotif, setActiveNotif] = useState(null);

  async function handleNotifClick(n) {
    // if invite-type, open dialog with Accept/Decline
    if (n.type === 'invite') {
      setActiveNotif(n);
      setDialogOpen(true);
      return;
    }
    // otherwise navigate / close
    setAnchor(null);
    if (n.link) {
      window.location.href = n.link;
    }
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

  async function doAccept() {
    try {
      const iid = activeNotif?.relatedId || await _resolveInviteId();
      if (!iid) throw new Error('invite id not found');
      await acceptInvite(auth.token, iid);
    } catch (e) { console.error('accept failed', e); }
    setDialogOpen(false); setActiveNotif(null); await refresh();
  }

  async function doDecline() {
    try {
      const iid = activeNotif?.relatedId || await _resolveInviteId();
      if (!iid) throw new Error('invite id not found');
      await declineInvite(auth.token, iid);
    } catch (e) { console.error('decline failed', e); }
    setDialogOpen(false); setActiveNotif(null); await refresh();
  }

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} sx={{ '&:hover': { boxShadow: '0 2px 8px rgba(37,216,197,0.12)', transform: 'translateY(-1px)' }, transition: 'all 120ms ease' }}>
        <Badge badgeContent={unread} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={handleClose} PaperProps={{ sx: { width: 420, maxHeight: 600 } }}>
        {items.length === 0 && <MenuItem disabled>No notifications</MenuItem>}
        {items.map((n, idx) => (
          <React.Fragment key={n.id || idx}>
            <MenuItem onClick={() => handleNotifClick(n)} sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
              <ListItemText primary={n.message} secondary={new Date(n.createdAt).toLocaleString()} sx={{ whiteSpace: 'normal' }} />
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
