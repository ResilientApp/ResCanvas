
import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Paper, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoomDetails, updateRoom } from '../api/rooms';

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

  useEffect(() => {
    async function load() {
      try {
        const data = await getRoomDetails(null, id);
        setRoom(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setType(data.type || 'public');
      } catch (e) {
        console.error('Failed to load room settings:', e);
        if (e?.message && e.message.toLowerCase().includes('forbidden')) {
          // show popup then redirect to dashboard
          setForbiddenMessage('You do not have permission to view settings for this room.');
          setForbiddenRedirect('/dashboard');
          setForbiddenOpen(true);
          // navigation happens when user acknowledges the dialog
        }
      }
    }
    load();
  }, [id]);

  async function save() {
    try {
      const body = { name, description, type };
      const res = await updateRoom(null, id, body);
      // update local state so UI reflects changes; updateRoom returns { room: {...} }
      if (res && res.id) {
        setRoom(prev => ({ ...prev, ...res }));
      } else if (res && res.room) {
        setRoom(res.room);
      }
      // After successful save, navigate back to the room
      setTimeout(() => navigate(`/rooms/${id}`), 250);
    } catch (e) {
      console.error('Failed to save room settings:', e);
      if (e?.message && e.message.toLowerCase().includes('forbidden')) {
        // show popup then redirect back to the room
        setForbiddenMessage('You do not have permission to change settings for this room.');
        setForbiddenRedirect(`/rooms/${id}`);
        setForbiddenOpen(true);
        // On OK the dialog will redirect to the room page (handled below)
      }
    }
  }

  if (!room) return <Typography>Loading...</Typography>;

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Settings for {room.name}</Typography>
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} fullWidth sx={{ my: 1 }} />
        <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth sx={{ my: 1 }} />
        <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth sx={{ my: 1 }}>
          <MenuItem value="public">Public</MenuItem>
          <MenuItem value="private">Private</MenuItem>
          <MenuItem value="secure">Secure</MenuItem>
        </TextField>
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Button variant="contained" onClick={save}>Save</Button>
          <Button variant="outlined" onClick={() => navigate(`/rooms/${id}`)}>Cancel</Button>
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
