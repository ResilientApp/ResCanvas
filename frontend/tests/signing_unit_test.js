/**
 * Simple unit test for ResVault signing functionality
 * Tests that the signing library integration works correctly
 */

const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');

function testSigning() {
  console.log('Testing ResVault signing functionality...\n');

  try {
    // Step 1: Generate a test keypair
    console.log('1. Generating test keypair...');
    const keyPair = nacl.sign.keyPair();
    const publicKeyBase58 = bs58.encode(keyPair.publicKey);
    const privateKeyBase58 = bs58.encode(keyPair.secretKey.slice(0, 32)); // seed only

    console.log(`   Public Key (Base58): ${publicKeyBase58}`);
    console.log(`   Private Key (Base58): ${privateKeyBase58.substring(0, 10)}...`);

    // Step 2: Create a test message (stroke data)
    console.log('\n2. Creating test message...');
    const strokeData = {
      roomId: 'test-room-123',
      user: 'testuser',
      color: '#000000',
      lineWidth: 2,
      pathData: [[100, 100], [200, 200]],
      timestamp: Date.now()
    };

    const canonicalJson = JSON.stringify(strokeData, Object.keys(strokeData).sort());
    console.log(`   Message: ${canonicalJson.substring(0, 50)}...`);

    // Step 3: Sign the message using the private key
    console.log('\n3. Signing message...');
    const messageBytes = Buffer.from(canonicalJson, 'utf-8');
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const reconstructedKeyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
    const signature = nacl.sign.detached(messageBytes, reconstructedKeyPair.secretKey);
    const signatureHex = Buffer.from(signature).toString('hex');

    console.log(`   Signature (hex): ${signatureHex.substring(0, 40)}...`);

    // Step 4: Verify the signature
    console.log('\n4. Verifying signature...');
    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signature,
      publicKeyBytes
    );

    console.log(`   Verification result: ${isValid ? '✓ VALID' : '✗ INVALID'}`);

    if (!isValid) {
      throw new Error('Signature verification failed!');
    }

    // Step 5: Test with tampered data
    console.log('\n5. Testing with tampered data...');
    const tamperedData = { ...strokeData, color: '#FF0000' }; // changed color
    const tamperedJson = JSON.stringify(tamperedData, Object.keys(tamperedData).sort());
    const tamperedBytes = Buffer.from(tamperedJson, 'utf-8');
    const isTamperedValid = nacl.sign.detached.verify(
      tamperedBytes,
      signature,
      publicKeyBytes
    );

    console.log(`   Tampered verification: ${isTamperedValid ? '✗ SHOULD FAIL' : '✓ CORRECTLY REJECTED'}`);

    if (isTamperedValid) {
      throw new Error('Tampered data was incorrectly validated!');
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ All signing tests passed!');
    console.log('='.repeat(50));

    return {
      success: true,
      publicKey: publicKeyBase58,
      privateKey: privateKeyBase58,
      signature: signatureHex
    };

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testSigning();
}

module.exports = { testSigning };
