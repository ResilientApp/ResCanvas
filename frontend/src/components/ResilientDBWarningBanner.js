/**
 * ResilientDBWarningBanner
 * 
 * Shows a persistent warning banner when ResilientDB GraphQL endpoint is down.
 * Users can still draw (saved to MongoDB), but blockchain persistence is unavailable.
 * Displays the number of strokes waiting to be synced to the blockchain.
 */

import React from 'react';
import { Alert, AlertTitle, Collapse } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';

export default function ResilientDBWarningBanner({ isHealthy, queueSize = 0 }) {
  return (
    <Collapse in={!isHealthy}>
      <Alert 
        severity="warning" 
        icon={<WarningIcon />}
        sx={{ 
          mb: 2,
          borderRadius: 1,
          '& .MuiAlert-message': {
            width: '100%'
          }
        }}
      >
        <AlertTitle>Blockchain Service Temporarily Unavailable</AlertTitle>
        Your drawings are being saved normally, but blockchain persistence is currently offline.
        {queueSize > 0 && (
          <> <strong>{queueSize} stroke{queueSize !== 1 ? 's' : ''}</strong> will be automatically synced once the service is restored.</>
        )}
        {queueSize === 0 && (
          <> Your work will be automatically synced to the blockchain once the service is restored.</>
        )}
      </Alert>
    </Collapse>
  );
}
