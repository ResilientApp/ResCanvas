import React, { useEffect } from 'react';
import { Box, Paper, Fade, Typography } from '@mui/material';

// Minimal snackbar-like component that does not use MUI Snackbar internals
// and therefore avoids forwarding internal slot props (like ownerState) into DOM.
export default function SafeSnackbar({ open, message, autoHideDuration = 4000, onClose = null }) {
  useEffect(() => {
    if (!open) return undefined;
    if (!autoHideDuration || autoHideDuration <= 0) return undefined;
    const t = setTimeout(() => { try { onClose && onClose(); } catch (_) {} }, autoHideDuration);
    return () => clearTimeout(t);
  }, [open, autoHideDuration, onClose]);

  return (
    <Fade in={!!open}>
      <Box sx={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1400 }}>
        <Paper elevation={6} sx={{ px: 2, py: 1, bgcolor: 'grey.900', color: 'white' }}>
          <Typography variant="body2">{message}</Typography>
        </Paper>
      </Box>
    </Fade>
  );
}
