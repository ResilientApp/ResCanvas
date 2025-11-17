#!/usr/bin/env python3
"""
Mock Crow API Test Script for Local Development

When the actual Crow endpoint (https://crow.resilientdb.com) is unavailable,
this script demonstrates the expected behavior and validates test logic locally.

Usage:
    python test_crow_mock.py
"""

import json
import time
from datetime import datetime

class MockCrowAPI:
    """Mock implementation of Crow API for testing."""
    
    def __init__(self):
        self.transactions = {}
        
    def commit_transaction(self, tx_id: str, value: str) -> dict:
        """Mock transaction commit."""
        if not tx_id or not value:
            return {
                "status": "error",
                "code": 400,
                "message": "Missing required fields: id and value"
            }
        
        if tx_id in self.transactions:
            return {
                "status": "error",
                "code": 409,
                "message": f"Transaction {tx_id} already exists"
            }
        
        self.transactions[tx_id] = {
            "id": tx_id,
            "value": value,
            "timestamp": datetime.utcnow().isoformat(),
            "block_number": len(self.transactions) + 1
        }
        
        return {
            "status": "success",
            "code": 201,
            "transaction": self.transactions[tx_id]
        }
    
    def query_transaction(self, tx_id: str) -> dict:
        """Mock transaction query."""
        if tx_id not in self.transactions:
            return {
                "status": "error",
                "code": 404,
                "message": f"Transaction {tx_id} not found"
            }
        
        return {
            "status": "success",
            "code": 200,
            "transaction": self.transactions[tx_id]
        }


def test_basic_commit(api: MockCrowAPI):
    """Test basic transaction commit."""
    print("\n" + "="*60)
    print("TEST 1: Basic Transaction Commit")
    print("="*60)
    
    test_id = f"key_test_{int(time.time())}"
    result = api.commit_transaction(test_id, "value_test")
    
    print(f"Transaction ID: {test_id}")
    print(f"Result: {json.dumps(result, indent=2)}")
    
    if result["status"] == "success":
        print("✓ SUCCESS: Transaction committed")
        return test_id
    else:
        print("✗ FAILED")
        return None


def test_query_transaction(api: MockCrowAPI, tx_id: str):
    """Test querying a transaction."""
    print("\n" + "="*60)
    print("TEST 2: Query Transaction")
    print("="*60)
    
    if not tx_id:
        print("⊘ SKIPPED: No transaction ID")
        return False
    
    result = api.query_transaction(tx_id)
    
    print(f"Query ID: {tx_id}")
    print(f"Result: {json.dumps(result, indent=2)}")
    
    if result["status"] == "success":
        print("✓ SUCCESS: Transaction retrieved")
        return True
    else:
        print("✗ FAILED")
        return False


def test_canvas_stroke(api: MockCrowAPI):
    """Test canvas stroke commit."""
    print("\n" + "="*60)
    print("TEST 3: Canvas Stroke Commit")
    print("="*60)
    
    stroke_id = f"stroke_{int(time.time())}"
    stroke_data = {
        "roomId": "test_room_123",
        "userId": "test_user_456",
        "points": [[0, 0], [10, 10], [20, 20], [30, 30]],
        "color": "#FF0000",
        "width": 2,
        "tool": "pen"
    }
    
    result = api.commit_transaction(stroke_id, json.dumps(stroke_data))
    
    print(f"Stroke ID: {stroke_id}")
    print(f"Stroke Data: {json.dumps(stroke_data, indent=2)}")
    print(f"Result: {json.dumps(result, indent=2)}")
    
    if result["status"] == "success":
        print("✓ SUCCESS: Canvas stroke committed")
        return True
    else:
        print("✗ FAILED")
        return False


def test_invalid_payload(api: MockCrowAPI):
    """Test invalid payload handling."""
    print("\n" + "="*60)
    print("TEST 4: Invalid Payload")
    print("="*60)
    
    result = api.commit_transaction("", "")
    
    print(f"Result: {json.dumps(result, indent=2)}")
    
    if result["status"] == "error" and result["code"] == 400:
        print("✓ SUCCESS: Invalid payload correctly rejected")
        return True
    else:
        print("✗ FAILED: Should have rejected invalid payload")
        return False


def test_duplicate_transaction(api: MockCrowAPI):
    """Test duplicate transaction handling."""
    print("\n" + "="*60)
    print("TEST 5: Duplicate Transaction")
    print("="*60)
    
    dup_id = f"dup_test_{int(time.time())}"
    
    # First commit
    result1 = api.commit_transaction(dup_id, "first_value")
    print(f"First commit: {result1['status']}")
    
    # Duplicate commit
    result2 = api.commit_transaction(dup_id, "second_value")
    print(f"Duplicate commit: {json.dumps(result2, indent=2)}")
    
    if result2["status"] == "error" and result2["code"] == 409:
        print("✓ SUCCESS: Duplicate correctly detected")
        return True
    else:
        print("✗ FAILED: Should have rejected duplicate")
        return False


def main():
    """Run all mock tests."""
    print("\n" + "="*60)
    print("Mock Crow API Test Suite")
    print("="*60)
    print("NOTE: Using local mock for testing logic")
    print("="*60)
    
    api = MockCrowAPI()
    results = []
    
    # Run tests
    tx_id = test_basic_commit(api)
    results.append(("Basic Commit", tx_id is not None))
    
    query_success = test_query_transaction(api, tx_id)
    results.append(("Query Transaction", query_success))
    
    stroke_success = test_canvas_stroke(api)
    results.append(("Canvas Stroke", stroke_success))
    
    invalid_success = test_invalid_payload(api)
    results.append(("Invalid Payload", invalid_success))
    
    dup_success = test_duplicate_transaction(api)
    results.append(("Duplicate Detection", dup_success))
    
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
    
    print("\n" + "="*60)
    print("Mock Test Complete")
    print("="*60)
    print("\nTo test against real Crow API:")
    print("  python test_crow_simple.py")
    print("\nTo check connectivity:")
    print("  python test_crow_connectivity.py")
    print("="*60 + "\n")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
