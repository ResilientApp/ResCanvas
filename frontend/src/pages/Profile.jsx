
import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

export default function Profile(){
  const [password, setPassword] = React.useState('');
  async function changePassword(){
    // call backend endpoint if exists
    try{
      await fetch('/auth/change_password', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password})});
      alert('Password change requested');
    }catch(e){ console.error(e); }
  }
  return (
    <Box sx={{p:2}}>
      <Typography variant="h6">Profile & Preferences</Typography>
      <TextField label="New password" value={password} onChange={(e)=>setPassword(e.target.value)} sx={{my:2}} />
      <Box><Button variant="contained" onClick={changePassword}>Change Password</Button></Box>
    </Box>
  );
}
