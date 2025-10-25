import ResVaultSDK from 'resvault-sdk';

/**
 * Lightweight wrapper around ResVault postMessage API.
 * Requires the ResVault Chrome extension to be installed & unlocked.
 * See: https://github.com/apache/incubator-resilientdb-resvault
 */
const sdk = new ResVaultSDK();

let isConnected = false;
let currentPublicKey = null;

// Enable verbose logging in development to diagnose message handshake issues
const isLocalhost = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const VERBOSE_LOG = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') || isLocalhost;

/**
 * Check if ResVault wallet extension is available
 */
export function isWalletAvailable() {
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
      try {
        const d = (event && event.data) || {};

        if (VERBOSE_LOG) console.debug('[resvault] login handler got event:', d, 'source=', event && event.source);

        // Support content-script wrappers which send { type: 'FROM_CONTENT_SCRIPT', data: { ... } }
        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

        // Some wrappers use 'success' or 'ok' interchangeably; normalize here
        const ok = payload.ok === true || payload.success === true;

        if ((payload.type === 'login' && payload.direction === 'response') || payload.loginResponse) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          if (ok || payload.ok) {
            isConnected = true;
            resolve(payload);
          } else {
            const errMsg = payload.error || payload.message || (payload.data && payload.data.error) || 'Wallet login failed';
            reject(new Error(errMsg));
          }
        }

        // Some content-script wrappers return a generic { success: boolean, error: string }
        // Treat those as a login response when present so we don't timeout silently.
        if (typeof payload.success !== 'undefined' || payload.error) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          if (payload.success === true) {
            isConnected = true;
            resolve(payload);
          } else {
            const errMsg = payload.error || payload.message || 'Wallet login failed';
            reject(new Error(errMsg));
          }
        }
      } catch (e) {
        if (VERBOSE_LOG) console.error('[resvault] login handler error', e);
      }
    };

    // Allow longer time for popup auth in slower environments
    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding. Please install ResVault extension.'));
    }, 10000);

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
      try {
        const d = (event && event.data) || {};
        if (VERBOSE_LOG) console.debug('[resvault] getPublicKey handler got event:', d);

        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

        const pubKey = payload.publicKey || payload.pubkey || (payload.data && payload.data.publicKey) || (payload.data && payload.data.pubkey);

        if ((payload.type === 'getPublicKey' && payload.direction === 'response') || pubKey) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          if (pubKey) {
            currentPublicKey = pubKey;
            resolve(pubKey);
          } else {
            reject(new Error('No public key returned from wallet'));
          }
        }

        // If wrapper reported a failure without a publicKey, surface that error
        if (typeof payload.success !== 'undefined' && payload.success === false) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          const errMsg = payload.error || payload.message || 'Wallet extension returned failure';
          reject(new Error(errMsg));
        }
      } catch (e) {
        if (VERBOSE_LOG) console.error('[resvault] getPublicKey handler error', e);
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding'));
    }, 10000);

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
      try {
        const d = (event && event.data) || {};
        if (VERBOSE_LOG) console.debug('[resvault] sign handler got event:', d);

        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

        const signature = payload.signature || payload.sig || (payload.data && payload.data.signature);

        if ((payload.type === 'sign' && payload.direction === 'response') || signature) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          if (signature) {
            resolve(signature);
          } else {
            const errMsg = payload.error || payload.message || 'Signing failed';
            reject(new Error(errMsg));
          }
        }

        // If wrapper reported a failure for signing, surface it
        if (typeof payload.success !== 'undefined' && payload.success === false) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          const errMsg = payload.error || payload.message || 'Wallet signing failed';
          reject(new Error(errMsg));
        }
      } catch (e) {
        if (VERBOSE_LOG) console.error('[resvault] sign handler error', e);
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet signing timeout'));
    }, 15000);

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
    const publicKey = await getWalletPublicKey();

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

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(canonical);

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

    // After obtaining the public key, inform any content-script/extension wrapper
    // that may rely on the site's signer public key so it can include it in
    // PrepareAsset payloads. Some ResVault wrappers listen for a message with
    // type: 'siteSignerInfo' or similar — include a permissive message so
    // content scripts can pick it up.
    try {
      sdk.sendMessage({ type: 'siteSignerInfo', direction: 'info', signerPublicKey: pubKey });
    } catch (err) {
      if (VERBOSE_LOG) console.warn('[resvault] failed to notify content script of signerPublicKey', err);
    }

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
