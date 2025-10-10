import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Box
} from '@mui/material';

export function ClearCanvasDialog({ open, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Clear Canvas</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to clear the canvas for everyone?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">No</Button>
        <Button onClick={onConfirm} color="primary" autoFocus>Yes</Button>
      </DialogActions>
    </Dialog>
  );
}

export function HistoryRecallDialog({
  open,
  onClose,
  historyStartInput,
  setHistoryStartInput,
  historyEndInput,
  setHistoryEndInput,
  onApply
}) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="history-recall-dialog">
      <DialogTitle id="history-recall-dialog">History Recall - Select Date/Time Range</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Choose a start and end date/time to recall drawings from ResilientDB. Only drawings within the selected range will be loaded.
        </DialogContentText>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={historyStartInput}
            onChange={(e) => setHistoryStartInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={historyEndInput}
            onChange={(e) => setHistoryEndInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onApply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}

export function DestructiveDeleteDialog({
  open,
  onClose,
  confirmText,
  setConfirmText,
  onConfirm
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Permanently delete room</DialogTitle>
      <DialogContent>
        <DialogContentText color="error">
          This will permanently delete this room and all its data for every user. This action is irreversible.
        </DialogContentText>
        <DialogContentText sx={{ mt: 1 }}>
          To confirm, type <strong>DELETE</strong> below.
        </DialogContentText>
        <TextField
          fullWidth
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          disabled={confirmText !== 'DELETE'}
          onClick={onConfirm}
        >
          Delete permanently
        </Button>
      </DialogActions>
    </Dialog>
  );
}
