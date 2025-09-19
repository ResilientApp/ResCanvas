import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Snackbar from '@mui/material/Snackbar';
import { Card,
  CardContent,
  CardActions,
  Box, Button, Paper, Typography, Stack, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { listRooms, createRoom, shareRoom } from '../api/rooms';
import { useNavigate } from 'react-router-dom';

function RoomsSection({title, roomList, onShare, onLeave, onDelete, onArchive, onOpenSettings}) {
  return (
    <Box sx={{mb:2}}>
      <Typography variant="h6" sx={{mb:1}}>{title} ({roomList.length})</Typography>
      <Stack direction="row" spacing={2} sx={{flexWrap:'wrap'}}>
        {roomList.map(r => (
          <Card key={r.id} sx={{width: 260, p:1}}>
            <CardContent>
              <Typography variant="subtitle1">{r.name}</Typography>
              <Typography variant="caption">Type: {r.type}</Typography>
              <Typography variant="body2">Owner: {r.ownerName || r.ownerId || '—'}</Typography>
              <Typography variant="body2">Members: {r.memberCount || r.membersCount || '—'}</Typography>
            </CardContent>
            <CardActions>
              <Button size="small" onClick={()=> window.location.href='/rooms/'+r.id}>Open</Button>
              <Button size="small" onClick={()=> onOpenSettings(r)}>Settings</Button>
              {r.isOwner ? <Button size="small" color="error" onClick={()=> onDelete(r)}>Delete</Button> : <Button size="small" color="warning" onClick={()=> onLeave(r)}>Leave</Button>}
              <Button size="small" onClick={()=> onShare(r)}>Share</Button>
            </CardActions>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

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

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      } else {
        console.error('Failed to fetch rooms');
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

    // inside Dashboard component (after fetchRooms or refresh)
    const leaveRoom = async (roomId) => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          // Refresh the list — use your refresh helper so listRooms stays consistent
          await refresh();
        } else {
          console.error('Failed to leave room', res.status);
        }
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    };
  

async function handleShare(room){
  // open share dialog
  setShareOpen(room.id);
}
async function handleLeave(room){
  try{
    await leaveRoom(room.id, auth.token);
  }catch(e){ console.error(e); }
}
async function handleDelete(room){
  try{
    await fetch('/rooms/'+room.id, { method: 'DELETE', headers: { Authorization: 'Bearer '+auth.token }});
    refresh();
  }catch(e){ console.error(e); }
}
function handleOpenSettings(room){
  // navigate to settings
  window.location.href = '/rooms/'+room.id+'/settings';
}


  function groupRooms(rooms){
    const groups = { public: [], private: [], secure: [], archived: [] };
    (rooms||[]).forEach(r=>{ if (r.archived) groups.archived.push(r); else if (r.type==='private') groups.private.push(r); else if (r.type==='secure') groups.secure.push(r); else groups.public.push(r); });
    return groups;
  }

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
