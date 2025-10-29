import React, { useState } from 'react';
import { Dialog, AppBar, Toolbar, Typography, IconButton, Box, TextField, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TemplateCard from './TemplateCard';
import { TEMPLATE_LIBRARY } from '../data/templates';

export function TemplateGallery({ onSelectTemplate, onClose }) {
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = TEMPLATE_LIBRARY.filter(template => {
    const matchesCategory = category === 'all' || template.category === category;
    const q = (searchQuery || '').toLowerCase();
    const matchesSearch = !q || template.name.toLowerCase().includes(q) || (template.tags || []).some(t => t.includes(q));
    return matchesCategory && matchesSearch;
  });

  return (
    <Dialog open fullScreen onClose={onClose}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Choose a Template</Typography>
          <IconButton color="inherit" onClick={onClose}><CloseIcon /></IconButton>
        </Toolbar>
      </AppBar>
      <Box p={3}>
        <Box display="flex" gap={2} mb={3}>
          <TextField fullWidth placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} InputProps={{ startAdornment: <SearchIcon /> }} />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Category</InputLabel>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <MenuItem value="all">All Categories</MenuItem>
              <MenuItem value="business">Business</MenuItem>
              <MenuItem value="design">Design</MenuItem>
              <MenuItem value="education">Education</MenuItem>
              <MenuItem value="engineering">Engineering</MenuItem>
              <MenuItem value="games">Games</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Grid container spacing={3}>
          {filteredTemplates.map(t => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={t.id}>
              <TemplateCard template={t} onSelect={() => onSelectTemplate(t)} />
            </Grid>
          ))}
        </Grid>

        {filteredTemplates.length === 0 && (
          <Box textAlign="center" py={8}><Typography variant="h6" color="textSecondary">No templates found</Typography></Box>
        )}
      </Box>
    </Dialog>
  );
}

export default TemplateGallery;
