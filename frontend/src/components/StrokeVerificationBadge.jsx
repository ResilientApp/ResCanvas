import React from 'react';
import { Tooltip, Chip, Box, Typography } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import WarningIcon from '@mui/icons-material/Warning';
import { getShortPublicKey } from '../wallet/resvault';

export default function StrokeVerificationBadge({ stroke, roomType }) {
  if (roomType !== 'secure') {
    return null;
  }

  const hasSigner = stroke.walletPubKey || stroke.signerPubKey;
  const hasSignature = stroke.walletSignature || stroke.signature;
  const isVerified = hasSigner && hasSignature;

  const signerKey = stroke.walletPubKey || stroke.signerPubKey;
  const shortKey = getShortPublicKey(signerKey);

  const tooltipContent = (
    <Box p={1}>
      <Typography variant="body2" gutterBottom>
        <strong>Stroke Signature Info</strong>
      </Typography>
      <Typography variant="caption" display="block">
        Status: {isVerified ? '✓ Verified' : '⚠ Unverified'}
      </Typography>
      {signerKey && (
        <>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            <strong>Signer:</strong>
          </Typography>
          <Typography
            variant="caption"
            display="block"
            sx={{
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              fontSize: '0.65rem'
            }}
          >
            {signerKey}
          </Typography>
        </>
      )}
      <Typography variant="caption" display="block" sx={{ mt: 1, fontStyle: 'italic' }}>
        {isVerified
          ? 'This stroke was cryptographically signed and verified.'
          : 'This stroke lacks proper signature verification.'}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Chip
        icon={isVerified ? <VerifiedIcon /> : <WarningIcon />}
        label={shortKey || 'Unknown'}
        size="small"
        color={isVerified ? 'success' : 'warning'}
        variant="outlined"
        sx={{
          cursor: 'help',
          fontSize: '0.7rem',
          height: '20px'
        }}
      />
    </Tooltip>
  );
}

export function getStrokeVerificationInfo(stroke, roomType) {
  if (roomType !== 'secure') {
    return { show: false };
  }

  const signerKey = stroke.walletPubKey || stroke.signerPubKey;
  const signature = stroke.walletSignature || stroke.signature;
  const isVerified = !!(signerKey && signature);

  return {
    show: true,
    isVerified,
    signerKey,
    shortKey: getShortPublicKey(signerKey),
    signature,
    message: isVerified
      ? `Signed by ${getShortPublicKey(signerKey)}`
      : 'Unverified stroke'
  };
}
