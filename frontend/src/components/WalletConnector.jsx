import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Tooltip
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import {
  connectWalletForSecureRoom,
  disconnectWallet,
  isWalletConnected,
  getShortPublicKey,
  getConnectionStatus
} from '../wallet/resvault';

/**
 * Wallet connection component for secure rooms
 * Manages ResVault wallet connection state and provides UI for users
 */
export default function WalletConnector({ roomType, onConnected, onDisconnected }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(getConnectionStatus());

  // Check connection status on mount
  useEffect(() => {
    const checkStatus = () => {
      const currentStatus = getConnectionStatus();
      setStatus(currentStatus);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => clearInterval(interval);
  }, []);

  // Notify parent when connection changes
  useEffect(() => {
    if (status.connected && onConnected) {
      onConnected(status.publicKey);
    } else if (!status.connected && onDisconnected) {
      onDisconnected();
    }
  }, [status.connected, status.publicKey, onConnected, onDisconnected]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const pubKey = await connectWalletForSecureRoom();
      setStatus({ connected: true, publicKey: pubKey });
    } catch (err) {
      console.error('Wallet connection failed:', err);

      // Provide helpful error message
      let errorMsg = err.message || 'Failed to connect wallet';

      if (errorMsg.includes('not connected') || errorMsg.includes('No keys found')) {
        errorMsg = 'Please connect your wallet to this site first:\n\n' +
          '1. Click the ResVault extension icon in your browser\n' +
          '2. Make sure you are logged in to ResVault\n' +
          '3. In the ResVault dashboard, select the network you want to use\n' +
          '4. Click the connection icon to connect to this site\n' +
          '5. Then try connecting again here';
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setStatus({ connected: false, publicKey: null });
  };

  if (roomType !== 'secure') {
    return null;
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mb: 2,
        backgroundColor: status.connected ? '#e8f5e9' : '#fff3e0',
        border: status.connected ? '2px solid #4caf50' : '2px solid #ff9800'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center" gap={2}>
          <AccountBalanceWalletIcon
            fontSize="large"
            color={status.connected ? 'success' : 'warning'}
          />
          <Box>
            <Typography variant="h6" component="div">
              Secure Room - Wallet Required
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {status.connected
                ? `Connected: ${getShortPublicKey(status.publicKey)}`
                : 'Connect your ResVault wallet to draw in this secure room'}
            </Typography>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={2}>
          {status.connected ? (
            <>
              <Tooltip title={`Full public key: ${status.publicKey}`}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Connected"
                  color="success"
                  variant="filled"
                />
              </Tooltip>
              <Button
                variant="outlined"
                color="error"
                onClick={handleDisconnect}
                size="small"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={handleConnect}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <AccountBalanceWalletIcon />}
            >
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          icon={<ErrorIcon />}
          sx={{ mt: 2 }}
          onClose={() => setError(null)}
        >
          <Typography variant="body2" component="div">
            <strong>Wallet Connection Failed</strong>
          </Typography>
          <Typography variant="body2" component="div" sx={{ mt: 1, whiteSpace: 'pre-line' }}>
            {error}
          </Typography>
          {error.includes('WALLET_NOT_CONNECTED') && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" component="div">
                <strong>How to connect:</strong>
              </Typography>
              <Typography variant="body2" component="ol" sx={{ pl: 2, mt: 1 }}>
                <li>Click the <strong>ResVault extension icon</strong> in your browser toolbar</li>
                <li>Make sure you're <strong>logged in</strong> to ResVault</li>
                <li>Select your desired <strong>network</strong> (e.g., ResilientDB Mainnet)</li>
                <li>Click the <strong>globe/connection icon</strong> to connect to this site</li>
                <li>Return here and click <strong>"Connect Wallet"</strong> again</li>
              </Typography>
            </Box>
          )}
          {error.includes('extension') && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Please install the ResVault Chrome extension from:{' '}
              <a
                href="https://github.com/apache/incubator-resilientdb-resvault"
                target="_blank"
                rel="noopener noreferrer"
              >
                ResVault GitHub
              </a>
            </Typography>
          )}
        </Alert>
      )}

      {!status.connected && !error && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Secure rooms require all strokes to be cryptographically signed with your wallet.
            This ensures verifiable authorship and prevents impersonation.
          </Typography>
        </Alert>
      )}
    </Paper>
  );
}
