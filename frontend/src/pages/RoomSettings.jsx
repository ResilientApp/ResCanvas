
import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Paper } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';

export default function RoomSettings(){
  const { id } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [retention, setRetention] = useState('never');

  useEffect(()=>{ async function load(){ const res = await fetch('/rooms/'+id); if (res.ok){ const j = await res.json(); setRoom(j.room); setName(j.room.name||''); setDescription(j.room.description||''); setType(j.room.type||'public'); } } load(); }, [id]);

  async function save(){
    try{
      const body = { name, description, type, retentionDays: retention==='never'? null : parseInt(retention) };
      const res = await fetch('/rooms/'+id, { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      if (res.ok) navigate('/dashboard');
    }catch(e){ console.error(e); }
  }

  if (!room) return <Typography>Loading...</Typography>;
  return (
    <Box sx={{p:2}}>
      <Paper sx={{p:2}}>
        <Typography variant="h6">Settings for {room.name}</Typography>
        <TextField label="Name" value={name} onChange={e=>setName(e.target.value)} fullWidth sx={{my:1}} />
        <TextField label="Description" value={description} onChange={e=>setDescription(e.target.value)} fullWidth sx={{my:1}} />
        <TextField select label="Type" value={type} onChange={e=>setType(e.target.value)} fullWidth sx={{my:1}}>
          <MenuItem value="public">Public</MenuItem>
          <MenuItem value="private">Private</MenuItem>
          <MenuItem value="secure">Secure</MenuItem>
        </TextField>
        <TextField select label="Retention" value={retention} onChange={e=>setRetention(e.target.value)} fullWidth sx={{my:1}}>
          <MenuItem value="never">Never</MenuItem>
          <MenuItem value="7">7 days</MenuItem>
          <MenuItem value="30">30 days</MenuItem>
          <MenuItem value="90">90 days</MenuItem>
        </TextField>
        <Box sx={{display:'flex', gap:1, mt:2}}>
          <Button variant="contained" onClick={save}>Save</Button>
          <Button variant="outlined" onClick={()=>navigate(-1)}>Cancel</Button>
        </Box>
      </Paper>
    </Box>
  );
}
