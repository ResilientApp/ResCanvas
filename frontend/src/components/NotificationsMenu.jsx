import React, { useEffect, useState } from 'react';
import { IconButton, Badge, Menu, MenuItem, ListItemText, Divider } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { listNotifications, markNotificationRead } from '../api/rooms';
import { onNotification, getSocket } from '../socket';

export default function NotificationsMenu({ auth }){
  const [anchor, setAnchor] = useState(null);
  const [items, setItems] = useState([]);
  const unread = items.filter(i=>!i.read).length;

  async function refresh(){
    if (!auth?.token) return;
    const res = await listNotifications(auth.token);
    setItems(res);
  }

  useEffect(()=>{
    refresh();
    if (!auth?.token) return;
    const off = onNotification((n)=>{
      setItems(prev => [{...n, id: n.id || Math.random().toString(36).slice(2)}, ...prev]);
    });
    getSocket(auth.token); // ensure socket alive
    return off;
  }, [auth?.token]);

  async function handleOpen(e){
    setAnchor(e.currentTarget);
    await refresh();
    // mark all unread as read when opening
    for (const it of items){
      if (!it.read){
        try{ await markNotificationRead(auth.token, it.id); } catch(_){}
      }
    }
  }

  function handleClose(){ setAnchor(null); }

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen}>
        <Badge badgeContent={unread} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={handleClose} PaperProps={{ sx:{ width: 360, maxHeight: 480 }}}>
        {items.length===0 && <MenuItem disabled>No notifications</MenuItem>}
        {items.map((n, idx)=>(
          <React.Fragment key={n.id || idx}>
            <MenuItem onClick={handleClose} component="a" href={n.link || '#'}>
              <ListItemText primary={n.message} secondary={new Date(n.createdAt).toLocaleString()} />
            </MenuItem>
            {idx<items.length-1 && <Divider />}
          </React.Fragment>
        ))}
      </Menu>
    </>
  );
}
