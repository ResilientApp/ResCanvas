#!/usr/bin/env python3
"""
Test script for the GraphQL endpoint that ResCanvas ACTUALLY uses.

This tests the real data path used by your application, not the Crow REST API.

Usage:
    python test_graphql_real.py
"""

import os
import sys
import json
import time
import logging

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.graphql_service import commit_transaction_via_graphql
from config import (
    SIGNER_PUBLIC_KEY,
    SIGNER_PRIVATE_KEY,
    RECIPIENT_PUBLIC_KEY,
    GRAPHQL_URL
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def test_basic_graphql_commit():
    """Test basic GraphQL transaction commit (what ResCanvas uses)."""
    print("\n" + "="*60)
    print("TEST: Basic GraphQL Commit (ResCanvas Production Path)")
    print("="*60)
    
    print(f"\nGraphQL Endpoint: {GRAPHQL_URL}")
    if SIGNER_PUBLIC_KEY:
        print(f"Public Key: {SIGNER_PUBLIC_KEY[:20]}...")
    else:
        print("Public Key: [NOT CONFIGURED]")
    
    # Create a test stroke payload exactly like ResCanvas does
    test_id = f"test_stroke_{int(time.time())}"
    stroke_data = {
        "roomId": "test_room_123",
        "type": "public",
        "id": test_id,
        "ts": int(time.time() * 1000),
        "user": "test_user",
        "value": json.dumps({
            "pathData": "M0,0 L10,10 L20,20",
            "color": "#FF0000",
            "lineWidth": 2,
            "tool": "pen"
        })
    }
    
    # Prepare payload exactly like submit_room_line.py does
    payload = {
        'operation': 'CREATE',
        'amount': 1,
        'signerPublicKey': SIGNER_PUBLIC_KEY,
        'signerPrivateKey': SIGNER_PRIVATE_KEY,
        'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
        'asset': {'data': stroke_data}
    }
    
    print(f"\nPayload structure:")
    print(f"  operation: {payload['operation']}")
    print(f"  asset.data.roomId: {stroke_data['roomId']}")
    print(f"  asset.data.id: {stroke_data['id']}")
    print(f"  asset.data.type: {stroke_data['type']}")
    
    try:
        print("\nCommitting transaction via GraphQL...")
        tx_id = commit_transaction_via_graphql(payload)
        
        print(f"\n✓ SUCCESS!")
        print(f"Transaction ID: {tx_id}")
        print(f"This is how ResCanvas commits strokes to ResilientDB!")
        return True
        
    except Exception as e:
        print(f"\n✗ FAILED: {str(e)}")
        print("\nThis indicates a problem with the GraphQL endpoint.")
        print("Check backend logs for detailed error information.")
        return False


def test_encrypted_stroke_commit():
    """Test encrypted stroke (for private/secure rooms)."""
    print("\n" + "="*60)
    print("TEST: Encrypted Stroke Commit (Private/Secure Rooms)")
    print("="*60)
    
    test_id = f"test_encrypted_{int(time.time())}"
    
    # Simulate encrypted data
    encrypted_data = {
        "roomId": "secure_room_456",
        "type": "secure",
        "id": test_id,
        "ts": int(time.time() * 1000),
        "user": "test_user",
        "encrypted": "base64_encrypted_blob_here"
    }
    
    payload = {
        'operation': 'CREATE',
        'amount': 1,
        'signerPublicKey': SIGNER_PUBLIC_KEY,
        'signerPrivateKey': SIGNER_PRIVATE_KEY,
        'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
        'asset': {'data': encrypted_data}
    }
    
    print(f"\nPayload structure:")
    print(f"  asset.data.type: {encrypted_data['type']}")
    print(f"  asset.data.encrypted: [blob]")
    
    try:
        print("\nCommitting encrypted transaction via GraphQL...")
        tx_id = commit_transaction_via_graphql(payload)
        
        print(f"\n✓ SUCCESS!")
        print(f"Transaction ID: {tx_id}")
        print(f"Encrypted strokes work!")
        return True
        
    except Exception as e:
        print(f"\n✗ FAILED: {str(e)}")
        return False


def test_undo_marker_commit():
    """Test undo marker commit (for persistent undo/redo)."""
    print("\n" + "="*60)
    print("TEST: Undo Marker Commit (Persistent Undo/Redo)")
    print("="*60)
    
    marker_id = f"undo-marker-{int(time.time())}"
    
    undo_data = {
        "id": marker_id,
        "ts": int(time.time() * 1000),
        "undone": True,
        "value": json.dumps({
            "strokeId": "stroke_123",
            "roomId": "test_room_123"
        })
    }
    
    payload = {
        'operation': 'CREATE',
        'amount': 1,
        'signerPublicKey': SIGNER_PUBLIC_KEY,
        'signerPrivateKey': SIGNER_PRIVATE_KEY,
        'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
        'asset': {'data': undo_data}
    }
    
    print(f"\nPayload structure:")
    print(f"  asset.data.id: {undo_data['id']}")
    print(f"  asset.data.undone: {undo_data['undone']}")
    
    try:
        print("\nCommitting undo marker via GraphQL...")
        tx_id = commit_transaction_via_graphql(payload)
        
        print(f"\n✓ SUCCESS!")
        print(f"Transaction ID: {tx_id}")
        print(f"Undo/redo persistence works!")
        return True
        
    except Exception as e:
        print(f"\n✗ FAILED: {str(e)}")
        return False


def verify_configuration():
    """Verify that configuration is correct."""
    print("\n" + "="*60)
    print("Configuration Check")
    print("="*60)
    
    issues = []
    
    if not GRAPHQL_URL:
        issues.append("GRAPHQL_URL not set in config")
    else:
        print(f"✓ GraphQL URL: {GRAPHQL_URL}")
    
    if not SIGNER_PUBLIC_KEY:
        issues.append("SIGNER_PUBLIC_KEY not set")
    else:
        pub_key_preview = SIGNER_PUBLIC_KEY[:20] if len(SIGNER_PUBLIC_KEY) > 20 else SIGNER_PUBLIC_KEY
        print(f"✓ Signer Public Key: {pub_key_preview}...")
    
    if not SIGNER_PRIVATE_KEY:
        issues.append("SIGNER_PRIVATE_KEY not set")
    else:
        print(f"✓ Signer Private Key: [configured]")
    
    if issues:
        print("\n✗ Configuration Issues:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    
    print("\n✓ All configuration valid!")
    return True


def main():
    """Run all GraphQL tests."""
    print("\n" + "="*60)
    print("ResCanvas GraphQL Service Test Suite")
    print("="*60)
    print("\nThis tests the ACTUAL API that ResCanvas uses,")
    print("not the Crow REST API that times out.")
    print("="*60)
    
    results = []
    
    # Verify config first
    if not verify_configuration():
        print("\n✗ Configuration invalid. Fix .env file and try again.")
        return False
    
    # Test 1: Basic commit
    results.append(("Basic GraphQL Commit", test_basic_graphql_commit()))
    time.sleep(1)
    
    # Test 2: Encrypted stroke
    results.append(("Encrypted Stroke", test_encrypted_stroke_commit()))
    time.sleep(1)
    
    # Test 3: Undo marker
    results.append(("Undo Marker", test_undo_marker_commit()))
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    for test_name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    passed = sum(1 for _, s in results if s)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.0f}%)")
    
    if passed == total:
        print("\n" + "="*60)
        print("✓ All GraphQL tests passed!")
        print("="*60)
        print("\nYour ResCanvas application is correctly configured")
        print("and can commit transactions to ResilientDB via GraphQL.")
        print("\nThe Crow REST API tests fail because ResCanvas")
        print("doesn't use that API - it uses GraphQL instead!")
        print("="*60)
    else:
        print("\n" + "="*60)
        print("⚠ Some GraphQL tests failed")
        print("="*60)
        print("\nCheck:")
        print("  1. Is the GraphQL endpoint responding?")
        print("  2. Are your signer keys valid?")
        print("  3. Check backend logs for detailed errors")
        print("="*60)
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
