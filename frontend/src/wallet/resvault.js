import ResVaultSDK from 'resvault-sdk';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const sdk = new ResVaultSDK();

let isConnected = false;
let currentPublicKey = null;

const isLocalhost = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const VERBOSE_LOG = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') || isLocalhost;

export function isWalletAvailable() {
  return typeof window !== 'undefined' && sdk !== null;
}

export function getConnectionStatus() {
  return {
    connected: isConnected,
    publicKey: currentPublicKey
  };
}

export async function walletLogin() {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      try {
        const d = (event && event.data) || {};

        if (VERBOSE_LOG) console.debug('[resvault] login handler got event:', d, 'source=', event && event.source);

        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

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

    const timeoutId = setTimeout(() => {
      sdk.removeMessageListener(handler);
      reject(new Error('Wallet extension not responding. Please install ResVault extension.'));
    }, 10000);

    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'login', direction: 'login' });
  });
}

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

export async function signMessageHex(messageUint8Array) {
  return new Promise((resolve, reject) => {
    let keysHandler = null;

    const handler = (event) => {
      try {
        const d = (event && event.data) || {};
        if (VERBOSE_LOG) console.debug('[resvault] sign handler got event:', d);

        const wrapped = (d && d.type === 'FROM_CONTENT_SCRIPT' && d.data) ? d.data : d;
        const payload = wrapped.resvault || wrapped.payload || wrapped.data || wrapped;

        if (payload.type === 'signWithKeys' && payload.direction === 'request') {
          if (VERBOSE_LOG) console.debug('[resvault] received keys for signing, performing local signature');

          sdk.removeMessageListener(handler);
          if (keysHandler) sdk.removeMessageListener(keysHandler);
          clearTimeout(timeoutId);

          try {
            const privateKeyBytes = bs58.decode(payload.privateKey);

            let keyPair;
            if (privateKeyBytes.length === 32) {
              keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
            } else if (privateKeyBytes.length === 64) {
              keyPair = nacl.sign.keyPair.fromSecretKey(privateKeyBytes);
            } else {
              throw new Error('Invalid private key length: ' + privateKeyBytes.length);
            }

            const signature = nacl.sign.detached(messageUint8Array, keyPair.secretKey);

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

export async function signStrokeForSecureRoom(roomId, stroke) {
  try {
    const publicKeyBase58 = await getWalletPublicKey();

    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const publicKeyHex = Array.from(publicKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const dataToSign = {
      roomId: roomId,
      user: stroke.user,
      color: stroke.color,
      lineWidth: stroke.lineWidth,
      pathData: stroke.pathData,
      timestamp: stroke.timestamp || stroke.ts
    };

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

    if (VERBOSE_LOG) {
      console.log('[resvault] Data to sign:', dataToSign);
      console.log('[resvault] Canonical JSON:', canonical);
    }

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(canonical);

    const signature = await signMessageHex(messageBytes);

    if (VERBOSE_LOG) {
      console.log('[resvault] Signature generated:', signature.substring(0, 32) + '...');
      console.log('[resvault] Public key (Base58):', publicKeyBase58);
      console.log('[resvault] Public key (Hex):', publicKeyHex.substring(0, 32) + '...');
    }

    return {
      signature,
      signerPubKey: publicKeyHex
    };
  } catch (error) {
    console.error('Failed to sign stroke:', error);
    throw new Error(`Wallet signing failed: ${error.message}`);
  }
}

export async function connectWalletForSecureRoom() {
  try {
    if (VERBOSE_LOG) console.log('[resvault] Checking wallet connection...');

    const pubKey = await getWalletPublicKey();

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

    const errorMsg = error.message || 'Wallet connection failed';
    if (errorMsg.includes('No keys found') || errorMsg.includes('not responding')) {
      throw new Error('WALLET_NOT_CONNECTED: Please connect your ResVault wallet to this site first');
    }

    throw error;
  }
}

export function disconnectWallet() {
  isConnected = false;
  currentPublicKey = null;
}

export function isWalletConnected() {
  return isConnected && currentPublicKey !== null;
}

export function getShortPublicKey(pubKey = null) {
  const key = pubKey || currentPublicKey;
  if (!key) return 'Not connected';
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}
