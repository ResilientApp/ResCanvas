import ResVaultSDK from 'resvault-sdk';
import nacl from 'tweetnacl';

/**
 * Lightweight wrapper around ResVault postMessage API.
 * Requires the ResVault Chrome extension to be installed & unlocked.
 * See: https://github.com/apache/incubator-resilientdb-resvault
 */
const sdk = new ResVaultSDK();

let isConnected = false;
let currentPublicKey = null;
let signingKeypair = null; // Client-side Ed25519 keypair for signing

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

        // Check if this is a login response
        const isLoginResponse = (
          (payload.type === 'login' && payload.direction === 'response') ||
          payload.loginResponse ||
          (payload.type === 'submitLoginTransaction' && payload.success) ||
          (wrapped.success !== undefined && wrapped.type === undefined) // Generic success from background
        );

        if (isLoginResponse) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          
          // Check for success
          const isSuccess = payload.ok === true || payload.success === true || wrapped.success === true;
          
          if (isSuccess) {
            isConnected = true;
            if (VERBOSE_LOG) console.log('[resvault] Login successful');
            resolve(payload);
          } else {
            const errMsg = payload.error || payload.message || wrapped.error || 'Wallet login failed. Please ensure you are logged into the ResVault extension.';
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
      reject(new Error('Wallet extension not responding. Please install ResVault extension and ensure you are logged in.'));
    }, 10000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'login', direction: 'login' });
    
    if (VERBOSE_LOG) console.log('[resvault] Sent login message to extension');
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

        // Extract public key from various possible response formats
        const pubKey = (
          payload.publicKey || 
          payload.pubkey || 
          wrapped.publicKey ||
          wrapped.pubkey ||
          (payload.data && payload.data.publicKey) || 
          (payload.data && payload.data.pubkey)
        );

        // Check if this is a getPublicKey response
        const isGetPubKeyResponse = (
          (payload.type === 'getPublicKey' && payload.direction === 'response') ||
          (payload.type === 'getPublicKey' && pubKey) ||
          (wrapped.type === 'getPublicKey') ||
          (pubKey && (payload.success === true || wrapped.success === true))
        );

        if (isGetPubKeyResponse) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          
          if (pubKey) {
            currentPublicKey = pubKey;
            if (VERBOSE_LOG) console.log('[resvault] Got public key:', pubKey);
            
            // Generate client-side keypair for signing (since extension doesn't support it)
            // Use the wallet pubkey as a seed to derive a deterministic keypair
            const seed = new TextEncoder().encode(pubKey).slice(0, 32);
            const paddedSeed = new Uint8Array(32);
            paddedSeed.set(seed);
            signingKeypair = nacl.sign.keyPair.fromSeed(paddedSeed);
            
            if (VERBOSE_LOG) console.log('[resvault] Generated signing keypair');
            
            resolve(pubKey);
          } else {
            const errMsg = payload.error || wrapped.error || 'No public key returned from wallet';
            reject(new Error(errMsg));
          }
        }

        // If wrapper reported a failure without a publicKey, surface that error
        if (typeof payload.success !== 'undefined' && payload.success === false && !pubKey) {
          sdk.removeMessageListener(handler);
          clearTimeout(timeoutId);
          const errMsg = payload.error || payload.message || wrapped.error || 'Wallet extension returned failure';
          reject(new Error(errMsg));
        }
      } catch (e) {
        if (VERBOSE_LOG) console.error('[resvault] getPublicKey handler error', e);
      }
    };

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding. Please ensure you are logged into ResVault.'));
    }, 10000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'getPublicKey', direction: 'request' });
    
    if (VERBOSE_LOG) console.log('[resvault] Sent getPublicKey request to extension');
  });
}

/**
 * Ask ResVault to sign an arbitrary message (using client-side keypair)
 * @param {Uint8Array} messageUint8Array - Message bytes to sign
 * @returns {Promise<string>} Hex-encoded signature
 */
export async function signMessageHex(messageUint8Array) {
  return new Promise((resolve, reject) => {
    try {
      if (!signingKeypair) {
        reject(new Error('Signing keypair not initialized. Please connect wallet first.'));
        return;
      }

      // Sign the message using client-side nacl keypair
      const signature = nacl.sign.detached(messageUint8Array, signingKeypair.secretKey);
      
      // Convert signature to hex string
      const hexSignature = Array.from(signature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      if (VERBOSE_LOG) console.log('[resvault] Signed message (client-side)', hexSignature.slice(0, 32) + '...');
      
      resolve(hexSignature);
    } catch (error) {
      if (VERBOSE_LOG) console.error('[resvault] Signing error:', error);
      reject(new Error(`Message signing failed: ${error.message}`));
    }
  });
}

/**
 * Sign a stroke object for a secure room
 * Creates canonical JSON representation matching backend verification
 * Uses client-side signing keypair derived from wallet authentication
 * @param {string} roomId - Room ID
 * @param {object} stroke - Stroke object {user, color, lineWidth, pathData, timestamp}
 * @returns {Promise<{signature: string, signerPubKey: string}>}
 */
export async function signStrokeForSecureRoom(roomId, stroke) {
  try {
    if (!signingKeypair) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    // Use the signing keypair's public key (hex encoded)
    const signerPubKey = Array.from(signingKeypair.publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

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
      signerPubKey
    };
  } catch (error) {
    console.error('Failed to sign stroke:', error);
    throw new Error(`Wallet signing failed: ${error.message}`);
  }
}

/**
 * Connect wallet for secure room usage
 * Authenticates with ResVault extension and generates client-side signing keypair
 * @returns {Promise<string>} Wallet public key (for display/verification)
 */
export async function connectWalletForSecureRoom() {
  try {
    // First, authenticate with the extension
    await walletLogin();

    // Then get the public key (this also generates the signing keypair)
    const pubKey = await getWalletPublicKey();

    isConnected = true;
    currentPublicKey = pubKey;

    if (VERBOSE_LOG) {
      console.log('[resvault] Wallet connected successfully');
      console.log('[resvault] Wallet public key:', pubKey);
      console.log('[resvault] Signing public key:', Array.from(signingKeypair.publicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''));
    }

    return pubKey;
  } catch (error) {
    isConnected = false;
    currentPublicKey = null;
    signingKeypair = null;
    
    // Provide more helpful error messages
    if (error.message.includes('not responding')) {
      throw new Error('ResVault extension not found. Please install the ResVault Chrome extension and try again.');
    } else if (error.message.includes('logged in')) {
      throw new Error('Please log in to your ResVault wallet first, then try connecting again.');
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
  signingKeypair = null;
  
  if (VERBOSE_LOG) console.log('[resvault] Wallet disconnected');
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
