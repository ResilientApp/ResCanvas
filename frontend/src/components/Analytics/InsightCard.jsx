import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

export default function InsightCard({ title, text }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-line' }}>{text}</Typography>
      </CardContent>
    </Card>
  );
}
