import React from 'react';
import { Box, Button, Paper, Typography, Fade, CircularProgress } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SafeSnackbar from './SafeSnackbar';

export function RoomHeader({ currentRoomName, historyMode, historyRange, currentRoomId, onExitRoom }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2100,
        bgcolor: 'background.paper',
        px: 2,
        py: 0.5,
        borderRadius: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        boxShadow: '0 6px 14px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.08)'
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
        {currentRoomName || 'Master (not in a room)'}
      </Typography>

      {historyMode && historyRange && (
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
          {new Date(historyRange.start).toLocaleString()} — {new Date(historyRange.end).toLocaleString()}
        </Typography>
      )}

      {currentRoomId && (
        <Button size="small" onClick={onExitRoom} sx={{ ml: 1 }}>
          Return to Master
        </Button>
      )}
    </Box>
  );
}

export function ArchivedBanner({ viewOnly, isOwner, onDeleteClick }) {
  if (!viewOnly) return null;
  
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2200,
        pointerEvents: 'none',
      }}
    >
      <Paper elevation={6} sx={{ px: 2, py: 0.5, bgcolor: 'rgba(33,33,33,0.86)', color: 'white', borderRadius: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', letterSpacing: 0.5 }}>
          Archived — View Only
        </Typography>
        {isOwner && (
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
            <Button
              size="small"
              color="error"
              variant="contained"
              onClick={onDeleteClick}
              sx={{ pointerEvents: 'all' }}
            >
              Delete permanently
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export function EditingDisabledBanner({ historyMode, selectedUser }) {
  const shouldShow = historyMode || (selectedUser && selectedUser !== "");
  
  return (
    <Fade in={shouldShow} timeout={300}>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          bgcolor: 'background.paper',
          px: 2,
          py: 0.6,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 1.5
        }}
      >
        <InfoOutlinedIcon fontSize="small" />
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {historyMode
            ? 'History Mode Enabled — Canvas Editing Disabled'
            : (selectedUser && selectedUser !== '' ? 'Viewing Past Drawing History of Selected User — Canvas Editing Disabled' : '')}
        </Typography>
      </Paper>
    </Fade>
  );
}

export function LoadingOverlay({ isLoading }) {
  return (
    <Fade in={Boolean(isLoading)} timeout={300}>
      <Paper
        elevation={6}
        sx={{
          position: 'absolute',
          left: '50%',
          top: '12%',
          transform: 'translateX(-50%)',
          padding: '8px 12px',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <CircularProgress size={18} />
        <Typography variant="body2">Loading Drawings...</Typography>
      </Paper>
    </Fade>
  );
}

export function RefreshingOverlay({ isRefreshing }) {
  if (!isRefreshing) return null;
  
  return (
    <div className="Canvas-loading-overlay">
      <div className="Canvas-spinner"></div>
    </div>
  );
}

export function CanvasSnackbar({ localSnack, onClose }) {
  return (
    <SafeSnackbar
      open={localSnack.open}
      message={localSnack.message}
      autoHideDuration={localSnack.duration}
      onClose={onClose}
    />
  );
}
