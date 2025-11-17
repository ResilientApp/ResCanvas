#!/usr/bin/env python3
"""
Simple Crow API Test Script

Quick test of the ResilientDB Crow endpoint based on the example:
curl --location 'https://crow.resilientdb.com/v1/transactions/commit' \
  --header 'Content-Type: application/json' \
  --data '{"id": "key_test", "value": "value_test"}'

Usage:
    python test_crow_simple.py
"""

import requests
import json
import time

# Configuration
CROW_BASE_URL = "https://crow.resilientdb.com"
COMMIT_ENDPOINT = f"{CROW_BASE_URL}/v1/transactions/commit"
QUERY_ENDPOINT = f"{CROW_BASE_URL}/v1/transactions/"
HEADERS = {"Content-Type": "application/json"}


def test_basic_commit():
    """Test basic transaction commit."""
    print("\n" + "="*60)
    print("TEST 1: Basic Transaction Commit")
    print("="*60)
    
    # Create payload with unique key
    test_id = f"key_test_{int(time.time())}"
    payload = {
        "id": test_id,
        "value": "value_test"
    }
    
    print(f"\nEndpoint: {COMMIT_ENDPOINT}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            COMMIT_ENDPOINT,
            headers=HEADERS,
            json=payload,
            timeout=30
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code in [200, 201]:
            print("\n✓ SUCCESS: Transaction committed successfully!")
            return test_id
        else:
            print(f"\n✗ FAILED: HTTP {response.status_code}")
            return None
            
    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        return None


def test_query_transaction(transaction_id):
    """Test querying a transaction."""
    print("\n" + "="*60)
    print("TEST 2: Query Transaction")
    print("="*60)
    
    if not transaction_id:
        print("\n⊘ SKIPPED: No transaction ID available")
        return False
    
    query_url = f"{QUERY_ENDPOINT}{transaction_id}"
    print(f"\nEndpoint: {query_url}")
    
    try:
        response = requests.get(
            query_url,
            headers=HEADERS,
            timeout=30
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            print("\n✓ SUCCESS: Transaction retrieved successfully!")
            return True
        else:
            print(f"\n✗ FAILED: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        return False


def test_canvas_stroke_commit():
    """Test committing a canvas stroke (ResCanvas specific)."""
    print("\n" + "="*60)
    print("TEST 3: Canvas Stroke Commit (ResCanvas)")
    print("="*60)
    
    # Simulate a canvas stroke
    stroke_id = f"stroke_{int(time.time())}"
    stroke_data = {
        "roomId": "test_room_123",
        "userId": "test_user_456",
        "points": [[0, 0], [10, 10], [20, 20], [30, 30]],
        "color": "#FF0000",
        "width": 2,
        "tool": "pen",
        "timestamp": int(time.time())
    }
    
    payload = {
        "id": stroke_id,
        "value": json.dumps(stroke_data)
    }
    
    print(f"\nEndpoint: {COMMIT_ENDPOINT}")
    print(f"Stroke ID: {stroke_id}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            COMMIT_ENDPOINT,
            headers=HEADERS,
            json=payload,
            timeout=30
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code in [200, 201]:
            print("\n✓ SUCCESS: Canvas stroke committed successfully!")
            return True
        else:
            print(f"\n✗ FAILED: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        return False


def test_multiple_commits():
    """Test multiple sequential commits."""
    print("\n" + "="*60)
    print("TEST 4: Multiple Sequential Commits")
    print("="*60)
    
    num_transactions = 3
    successes = 0
    
    for i in range(num_transactions):
        test_id = f"multi_test_{int(time.time())}_{i}"
        payload = {
            "id": test_id,
            "value": f"multi_value_{i}"
        }
        
        print(f"\n[{i+1}/{num_transactions}] Committing: {test_id}")
        
        try:
            response = requests.post(
                COMMIT_ENDPOINT,
                headers=HEADERS,
                json=payload,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                print(f"  ✓ Success (HTTP {response.status_code})")
                successes += 1
            else:
                print(f"  ✗ Failed (HTTP {response.status_code})")
                
        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
        
        time.sleep(0.5)  # Small delay between requests
    
    print(f"\n{'='*60}")
    print(f"Results: {successes}/{num_transactions} successful")
    
    if successes == num_transactions:
        print("✓ SUCCESS: All transactions committed!")
        return True
    else:
        print(f"⚠ PARTIAL: Only {successes} succeeded")
        return False


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("ResilientDB Crow Endpoint Test Suite")
    print("="*60)
    print(f"Base URL: {CROW_BASE_URL}")
    print(f"Commit Endpoint: {COMMIT_ENDPOINT}")
    print(f"Query Endpoint: {QUERY_ENDPOINT}")
    
    results = []
    
    # Test 1: Basic commit
    tx_id = test_basic_commit()
    results.append(("Basic Commit", tx_id is not None))
    
    # Small delay
    time.sleep(1)
    
    # Test 2: Query transaction
    query_success = test_query_transaction(tx_id)
    results.append(("Query Transaction", query_success))
    
    # Small delay
    time.sleep(1)
    
    # Test 3: Canvas stroke
    stroke_success = test_canvas_stroke_commit()
    results.append(("Canvas Stroke", stroke_success))
    
    # Small delay
    time.sleep(1)
    
    # Test 4: Multiple commits
    multi_success = test_multiple_commits()
    results.append(("Multiple Commits", multi_success))
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.0f}%)")
    print("="*60 + "\n")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
