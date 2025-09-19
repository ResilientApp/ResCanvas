import ResVaultSDK from 'resvault-sdk';

/**
 * Lightweight wrapper around ResVault postMessage API.
 * Requires the ResVault Chrome extension to be installed & unlocked.
 * See: SDK README and Quickstart. 
 */
const sdk = new ResVaultSDK();

export async function walletLogin() {
  // The SDK uses postMessage; we send a login request and await a response.
  // The concrete message schema comes from the SDK; here we follow the documented example.
  return new Promise((resolve) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'login' && d.direction === 'response' && d.ok) {
        sdk.removeMessageListener(handler);
        resolve(d);
      }
    };
    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'login', direction: 'login' });
  });
}

// Request the wallet's public key (hex)
export async function getWalletPublicKey() {
  return new Promise((resolve) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'getPublicKey' && d.direction === 'response' && d.publicKey) {
        sdk.removeMessageListener(handler);
        resolve(d.publicKey);
      }
    };
    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'getPublicKey', direction: 'request' });
  });
}

// Ask ResVault to sign an arbitrary message (returns hex signature)
export async function signMessageHex(messageUint8Array) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const d = event.data || {};
      if (d.type === 'sign' && d.direction === 'response') {
        sdk.removeMessageListener(handler);
        return d.signature ? resolve(d.signature) : reject(new Error(d.error || "sign failed"));
      }
    };
    sdk.addMessageListener(handler);
    sdk.sendMessage({ type: 'sign', direction: 'request', payload: Array.from(messageUint8Array) });
  });
}
