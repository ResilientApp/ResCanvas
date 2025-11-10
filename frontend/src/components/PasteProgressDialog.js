import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

/**
 * Progress dialog for paste operations
 * Shows real-time progress with cancel option
 */
function PasteProgressDialog({ open, progress, onCancel, onClose }) {
  const { current = 0, total = 0, processed = 0, failed = 0, completed = false, error = null } = progress || {};
  
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isComplete = completed || current >= total;
  const hasError = failed > 0 || error;

  return (
    <Dialog
      open={open}
      onClose={isComplete ? onClose : undefined}
      disableEscapeKeyDown={!isComplete}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {isComplete ? 'Paste Complete' : 'Pasting Items...'}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {isComplete
                ? `Completed: ${processed} succeeded${failed > 0 ? `, ${failed} failed` : ''}`
                : `Processing: ${current} / ${total} items`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {percentage}%
            </Typography>
          </Box>
          
          <LinearProgress
            variant="determinate"
            value={percentage}
            color={hasError ? 'warning' : 'primary'}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        {isComplete && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            {hasError ? (
              <>
                <ErrorIcon color="warning" />
                <Typography variant="body2" color="warning.main">
                  {failed > 0 ? `${failed} items failed to paste` : 'Some items may not have been pasted correctly'}
                </Typography>
              </>
            ) : (
              <>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="success.main">
                  All items pasted successfully!
                </Typography>
              </>
            )}
          </Box>
        )}

        {error && (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography variant="body2" color="error.dark">
              Error: {error}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {isComplete ? (
          <Button onClick={onClose} color="primary" variant="contained">
            Close
          </Button>
        ) : (
          <Button onClick={onCancel} color="error">
            Cancel
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default PasteProgressDialog;
