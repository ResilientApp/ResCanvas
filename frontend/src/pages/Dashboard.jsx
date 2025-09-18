import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions } from '@mui/material';
import { listRooms, createRoom, shareRoom } from '../api/rooms';
import { useNavigate } from 'react-router-dom';

export default function Dashboard({ auth }) {
  const nav = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('public');
  const [shareOpen, setShareOpen] = useState(null); // roomId
  const [shareUsernames, setShareUsernames] = useState('');

  async function refresh(){ setRooms(await listRooms(auth.token)); }
  useEffect(()=>{ refresh(); }, []);

  async function doCreate(){
    const r = await createRoom(auth.token, {name:newName, type:newType});
    setOpenCreate(false); setNewName(''); setNewType('public');
    await refresh(); nav(`/rooms/${r.id}`);
  }
  async function doShare(){
    await shareRoom(auth.token, shareOpen, shareUsernames.split(',').map(s=>s.trim()).filter(Boolean));
    setShareOpen(null); setShareUsernames('');
  }

  return (
    <Box sx={{p:3, display:'grid', gap:2}}>
      <Typography variant="h5">Your Canvas Rooms</Typography>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={()=>{setNewType('public'); setOpenCreate(true);}}>New Public</Button>
        <Button variant="contained" onClick={()=>{setNewType('private'); setOpenCreate(true);}}>New Private</Button>
        <Button variant="contained" onClick={()=>{setNewType('secure'); setOpenCreate(true);}}>New Secure</Button>
      </Stack>
      <Box sx={{display:'grid', gap:2}}>
        {rooms.map(r=>(
          <Paper key={r.id} sx={{p:2, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <Box>
              <Typography variant="subtitle1">{r.name}</Typography>
              <Chip label={r.type.toUpperCase()} size="small" sx={{mt:1}}/>
            </Box>
            <Box sx={{display:'flex', gap:1}}>
              {(r.type !== 'public') && <Button onClick={()=>setShareOpen(r.id)}>Share…</Button>}
              <Button variant="contained" onClick={()=>nav(`/rooms/${r.id}`)}>Open</Button>
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={openCreate} onClose={()=>setOpenCreate(false)}>
        <DialogTitle>New {newType} canvas</DialogTitle>
        <DialogContent>
          <TextField label="Name" value={newName} onChange={e=>setNewName(e.target.value)} fullWidth sx={{mt:1}}/>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setOpenCreate(false)}>Cancel</Button>
          <Button onClick={doCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!shareOpen} onClose={()=>setShareOpen(null)}>
        <DialogTitle>Share room</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{mb:1}}>Comma-separated usernames to add as editors.</Typography>
          <TextField label="Usernames" value={shareUsernames} onChange={e=>setShareUsernames(e.target.value)} fullWidth/>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setShareOpen(null)}>Close</Button>
          <Button onClick={doShare} variant="contained">Share</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
