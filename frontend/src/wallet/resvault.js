import ResVaultSDK from 'resvault-sdk';

/**
 * Lightweight wrapper around ResVault postMessage API.
 * Requires the ResVault Chrome extension to be installed & unlocked.
 * See: https://github.com/apache/incubator-resilientdb-resvault
 */
const sdk = new ResVaultSDK();

// Track wallet connection state
let isConnected = false;
let currentPublicKey = null;

/**
 * Check if ResVault wallet extension is available
 */
export function isWalletAvailable() {
  // Check if the extension injected the SDK
  return typeof window !== 'undefined' && sdk !== null;
}

/**
 * Get current connection status
 */
export function getConnectionStatus() {
  return {
    connected: isConnected,
    publicKey: currentPublicKey
  };
}

/**
 * Login to wallet (unlock if needed)
 */
export async function walletLogin() {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'login' && d.direction === 'response') {
        sdk.removeMessageListener(handler);
        clearTimeout(timeoutId);
        if (d.ok) {
          isConnected = true;
          resolve(d);
        } else {
          reject(new Error(d.error || 'Wallet login failed'));
        }
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding. Please install ResVault extension.'));
    }, 3000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'login', direction: 'login' });
  });
}

/**
 * Request the wallet's public key (hex format)
 */
export async function getWalletPublicKey() {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'getPublicKey' && d.direction === 'response') {
        sdk.removeMessageListener(handler);
        clearTimeout(timeoutId);
        if (d.publicKey) {
          currentPublicKey = d.publicKey;
          resolve(d.publicKey);
        } else {
          reject(new Error('No public key returned from wallet'));
        }
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding'));
    }, 3000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'getPublicKey', direction: 'request' });
  });
}

/**
 * Ask ResVault to sign an arbitrary message
 * @param {Uint8Array} messageUint8Array - Message bytes to sign
 * @returns {Promise<string>} Hex-encoded signature
 */
export async function signMessageHex(messageUint8Array) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'sign' && d.direction === 'response') {
        sdk.removeMessageListener(handler);
        clearTimeout(timeoutId);
        if (d.signature) {
          resolve(d.signature);
        } else {
          reject(new Error(d.error || 'Signing failed'));
        }
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet signing timeout'));
    }, 5000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({
      type: 'sign',
      direction: 'request',
      payload: Array.from(messageUint8Array)
    });
  });
}

/**
 * Sign a stroke object for a secure room
 * Creates canonical JSON representation matching backend verification
 * @param {string} roomId - Room ID
 * @param {object} stroke - Stroke object {user, color, lineWidth, pathData, timestamp}
 * @returns {Promise<{signature: string, signerPubKey: string}>}
 */
export async function signStrokeForSecureRoom(roomId, stroke) {
  try {
    // Get wallet public key
    const publicKey = await getWalletPublicKey();

    // Create canonical message matching backend expectations
    // Must match: json.dumps({...}, separators=(',', ':'), sort_keys=True)
    const canonical = JSON.stringify({
      roomId: roomId,
      user: stroke.user,
      color: stroke.color,
      lineWidth: stroke.lineWidth,
      pathData: stroke.pathData,
      timestamp: stroke.timestamp || stroke.ts
    }, Object.keys({
      color: null,
      lineWidth: null,
      pathData: null,
      roomId: null,
      timestamp: null,
      user: null
    }).sort());

    // Convert to Uint8Array for signing
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(canonical);

    // Sign with wallet
    const signature = await signMessageHex(messageBytes);

    return {
      signature,
      signerPubKey: publicKey
    };
  } catch (error) {
    console.error('Failed to sign stroke:', error);
    throw new Error(`Wallet signing failed: ${error.message}`);
  }
}

/**
 * Connect wallet for secure room usage
 * @returns {Promise<string>} Connected wallet public key
 */
export async function connectWalletForSecureRoom() {
  try {
    await walletLogin();

    const pubKey = await getWalletPublicKey();

    isConnected = true;
    currentPublicKey = pubKey;

    return pubKey;
  } catch (error) {
    isConnected = false;
    currentPublicKey = null;
    throw error;
  }
}

/**
 * Disconnect wallet
 */
export function disconnectWallet() {
  isConnected = false;
  currentPublicKey = null;
}

/**
 * Check if wallet is currently connected
 */
export function isWalletConnected() {
  return isConnected && currentPublicKey !== null;
}

/**
 * Get display version of public key (shortened)
 */
export function getShortPublicKey(pubKey = null) {
  const key = pubKey || currentPublicKey;
  if (!key) return 'Not connected';
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}
