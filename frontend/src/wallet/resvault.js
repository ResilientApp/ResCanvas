import ResVaultSDK from 'resvault-sdk';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

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
    let keysHandler = null;

    const handler = (event) => {
      try {
        const d = (event && event.data) || {};
        if (VERBOSE_LOG) console.debug('[resvault] sign handler got event:', d);

        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

        // Check if we received keys for signing
        if (payload.type === 'signWithKeys' && payload.direction === 'request') {
          if (VERBOSE_LOG) console.debug('[resvault] received keys for signing, performing local signature');

          // Remove this handler since we got the keys
          sdk.removeMessageListener(handler);
          if (keysHandler) sdk.removeMessageListener(keysHandler);
          clearTimeout(timeoutId);

          try {
            // Decode the Base58-encoded private key
            const privateKeyBytes = bs58.decode(payload.privateKey);

            // Generate keypair from the seed (first 32 bytes)
            let keyPair;
            if (privateKeyBytes.length === 32) {
              keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
            } else if (privateKeyBytes.length === 64) {
              keyPair = nacl.sign.keyPair.fromSecretKey(privateKeyBytes);
            } else {
              throw new Error('Invalid private key length: ' + privateKeyBytes.length);
            }

            // Sign the message
            const signature = nacl.sign.detached(messageUint8Array, keyPair.secretKey);

            // Convert to hex
            const signatureHex = Array.from(signature)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

            if (VERBOSE_LOG) console.debug('[resvault] signature generated:', signatureHex);
            resolve(signatureHex);
          } catch (error) {
            console.error('[resvault] error during local signing:', error);
            reject(new Error('Local signing failed: ' + error.message));
          }
          return;
        }

        const signature = payload.signature || payload.sig || (payload.data && payload.data.signature);

        if ((payload.type === 'sign' && payload.direction === 'response') || signature) {
          sdk.removeMessageListener(handler);
          if (keysHandler) sdk.removeMessageListener(keysHandler);
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
          if (keysHandler) sdk.removeMessageListener(keysHandler);
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
    const publicKeyBase58 = await getWalletPublicKey();

    // Convert Base58 public key to hex for backend
    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const publicKeyHex = Array.from(publicKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create canonical JSON to match backend's exact format
    // Backend uses: json.dumps({...}, separators=(',', ':'), sort_keys=True)
    // This creates compact JSON with ALL keys sorted (including nested objects)
    const dataToSign = {
      roomId: roomId,
      user: stroke.user,
      color: stroke.color,
      lineWidth: stroke.lineWidth,
      pathData: stroke.pathData,
      timestamp: stroke.timestamp || stroke.ts
    };

    // Deep sort all keys to match Python's sort_keys=True behavior
    function sortKeysDeep(obj) {
      if (Array.isArray(obj)) {
        return obj.map(item => sortKeysDeep(item));
      } else if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((result, key) => {
          result[key] = sortKeysDeep(obj[key]);
          return result;
        }, {});
      }
      return obj;
    }

    const sortedData = sortKeysDeep(dataToSign);
    const canonical = JSON.stringify(sortedData);

    console.log('[resvault] Data to sign:', dataToSign);
    console.log('[resvault] Sorted data:', sortedData);
    console.log('[resvault] Canonical JSON:', canonical);

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(canonical);

    const signature = await signMessageHex(messageBytes);

    console.log('[resvault] Signature generated:', signature);
    console.log('[resvault] Public key (Base58):', publicKeyBase58);
    console.log('[resvault] Public key (Hex):', publicKeyHex);

    return {
      signature,
      signerPubKey: publicKeyHex  // Send hex format to backend
    };
  } catch (error) {
    console.error('Failed to sign stroke:', error);
    throw new Error(`Wallet signing failed: ${error.message}`);
  }
}

/**
 * Connect wallet for secure room usage
 * This checks if the wallet is already connected to this domain
 * If not, user must manually connect via the ResVault extension popup
 * @returns {Promise<string>} Connected wallet public key
 */
export async function connectWalletForSecureRoom() {
  try {
    if (VERBOSE_LOG) console.log('[resvault] Checking wallet connection...');

    // Try to get the public key - this will work if user has already
    // connected their wallet to this domain via the ResVault extension
    const pubKey = await getWalletPublicKey();

    // Inform content script about the public key
    try {
      sdk.sendMessage({ type: 'siteSignerInfo', direction: 'info', signerPublicKey: pubKey });
    } catch (err) {
      if (VERBOSE_LOG) console.warn('[resvault] failed to notify content script of signerPublicKey', err);
    }

    isConnected = true;
    currentPublicKey = pubKey;

    if (VERBOSE_LOG) console.log('[resvault] Wallet connected successfully:', pubKey);
    return pubKey;
  } catch (error) {
    isConnected = false;
    currentPublicKey = null;

    if (VERBOSE_LOG) console.error('[resvault] Wallet connection check failed:', error);

    // Provide a clear error message for users
    const errorMsg = error.message || 'Wallet connection failed';
    if (errorMsg.includes('No keys found') || errorMsg.includes('not responding')) {
      throw new Error('WALLET_NOT_CONNECTED: Please connect your ResVault wallet to this site first');
    }

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
