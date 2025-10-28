import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button, FormControl, InputLabel, Select, MenuItem, Autocomplete, Switch, FormControlLabel } from '@mui/material';
import { getAuthToken } from '../utils/authUtils';

export function SaveAsTemplate({ canvasData, open, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('business');
  const [tags, setTags] = useState([]);
  const [isPublic, setIsPublic] = useState(false);

  const handleSave = async () => {
    const template = {
      name,
      description,
      category,
      tags,
      is_public: isPublic,
      canvas: {
        width: canvasData.width,
        height: canvasData.height,
        background: canvasData.background,
        objects: canvasData.objects
      }
    };

    const token = getAuthToken();
    try {
      await fetch('/api/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(template)
      });
      onClose();
    } catch (e) {
      console.error('Save template failed', e);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Save as Template</DialogTitle>
      <DialogContent>
        <TextField fullWidth label="Template Name" value={name} onChange={(e) => setName(e.target.value)} margin="normal" />
        <TextField fullWidth multiline rows={3} label="Description" value={description} onChange={(e) => setDescription(e.target.value)} margin="normal" />
        <FormControl fullWidth margin="normal">
          <InputLabel>Category</InputLabel>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <MenuItem value="business">Business</MenuItem>
            <MenuItem value="design">Design</MenuItem>
            <MenuItem value="education">Education</MenuItem>
            <MenuItem value="engineering">Engineering</MenuItem>
            <MenuItem value="games">Games</MenuItem>
          </Select>
        </FormControl>
        <Autocomplete multiple options={['brainstorming', 'planning', 'wireframe', 'diagram', 'education']} value={tags} onChange={(e, newValue) => setTags(newValue)} renderInput={(params) => <TextField {...params} label="Tags" margin="normal" />} />
        <FormControlLabel control={<Switch checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />} label="Make public (share with community)" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save Template</Button>
      </DialogActions>
    </Dialog>
  );
}

export default SaveAsTemplate;
