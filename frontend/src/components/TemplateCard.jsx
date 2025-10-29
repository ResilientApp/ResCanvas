import React from 'react';
import { Card, CardMedia, CardContent, Typography, Box, Chip, CardActions, Button } from '@mui/material';

export function TemplateCard({ template, onSelect }) {
  const handleSelect = (e) => {
    e.stopPropagation(); // Prevent any double-triggering
    onSelect();
  };

  return (
    <Card
      sx={{ cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 3 } }}
    >
      <CardMedia component="img" height="160" image={template.thumbnail} alt={template.name} />
      <CardContent>
        <Typography variant="h6" gutterBottom>{template.name}</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>{template.description}</Typography>
        <Box display="flex" gap={0.5} mt={1} flexWrap="wrap">
          {(template.tags || []).map(tag => (
            <Chip key={tag} label={tag} size="small" />
          ))}
        </Box>
        <Box mt={1}>
          <Chip label={template.difficulty} size="small" color={template.difficulty === 'beginner' ? 'success' : (template.difficulty === 'intermediate' ? 'warning' : 'error')} />
        </Box>
      </CardContent>
      <CardActions>
        <Button size="small" fullWidth variant="contained" onClick={handleSelect}>Use Template</Button>
      </CardActions>
    </Card>
  );
}

export default TemplateCard;
