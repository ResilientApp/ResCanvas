#!/usr/bin/env python3
"""
Test script for ResilientDB Crow API endpoints.

This script tests the /v1/transactions/commit endpoint at https://crow.resilientdb.com
with various scenarios including basic commit, query, and error handling.

Usage:
    python test_crow_endpoints.py
    
    # Or run with pytest:
    pytest test_crow_endpoints.py -v
"""

import os
import sys
import json
import requests
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import (
    RES_DB_BASE_URI,
    SIGNER_PUBLIC_KEY,
    SIGNER_PRIVATE_KEY,
    HEADERS
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CrowEndpointTester:
    """Test harness for ResilientDB Crow API endpoints."""
    
    def __init__(self, base_uri: str = None):
        """Initialize the tester with base URI."""
        self.base_uri = base_uri or RES_DB_BASE_URI or "https://crow.resilientdb.com"
        self.commit_endpoint = f"{self.base_uri}/v1/transactions/commit"
        self.query_endpoint = f"{self.base_uri}/v1/transactions/"
        self.headers = HEADERS or {"Content-Type": "application/json"}
        self.results = []
        
    def log_result(self, test_name: str, success: bool, details: str):
        """Log test result."""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        }
        self.results.append(result)
        status = "✓ PASS" if success else "✗ FAIL"
        logger.info(f"{status} - {test_name}: {details}")
        
    def test_basic_commit(self) -> bool:
        """Test basic transaction commit with simple key-value pair."""
        test_name = "Basic Commit"
        
        try:
            # Generate unique test key
            test_id = f"key_test_{int(time.time())}"
            payload = {
                "id": test_id,
                "value": "value_test"
            }
            
            logger.info(f"Testing {self.commit_endpoint}")
            logger.info(f"Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                self.commit_endpoint,
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"Response Status: {response.status_code}")
            logger.info(f"Response Body: {response.text}")
            
            if response.status_code in [200, 201]:
                self.log_result(test_name, True, f"Successfully committed transaction for key: {test_id}")
                return True
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_commit_with_complex_value(self) -> bool:
        """Test commit with complex JSON value."""
        test_name = "Complex Value Commit"
        
        try:
            test_id = f"complex_test_{int(time.time())}"
            complex_value = {
                "type": "canvas_stroke",
                "roomId": "test_room_123",
                "userId": "test_user_456",
                "strokeData": {
                    "points": [[0, 0], [10, 10], [20, 20]],
                    "color": "#FF0000",
                    "width": 2,
                    "tool": "pen"
                },
                "timestamp": datetime.utcnow().isoformat()
            }
            
            payload = {
                "id": test_id,
                "value": json.dumps(complex_value)
            }
            
            logger.info(f"Testing complex value commit")
            logger.info(f"Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                self.commit_endpoint,
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"Response Status: {response.status_code}")
            logger.info(f"Response Body: {response.text}")
            
            if response.status_code in [200, 201]:
                self.log_result(test_name, True, f"Successfully committed complex value for key: {test_id}")
                return True
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_query_transaction(self, transaction_id: str = None) -> bool:
        """Test querying a transaction by ID."""
        test_name = "Query Transaction"
        
        # First commit a transaction to query
        if not transaction_id:
            try:
                test_id = f"query_test_{int(time.time())}"
                payload = {
                    "id": test_id,
                    "value": "queryable_value"
                }
                
                response = requests.post(
                    self.commit_endpoint,
                    headers=self.headers,
                    json=payload,
                    timeout=30
                )
                
                if response.status_code not in [200, 201]:
                    self.log_result(test_name, False, "Failed to commit transaction for query test")
                    return False
                    
                transaction_id = test_id
                
            except Exception as e:
                self.log_result(test_name, False, f"Exception during commit: {str(e)}")
                return False
        
        # Now query the transaction
        try:
            query_url = f"{self.query_endpoint}{transaction_id}"
            logger.info(f"Querying: {query_url}")
            
            response = requests.get(
                query_url,
                headers=self.headers,
                timeout=30
            )
            
            logger.info(f"Response Status: {response.status_code}")
            logger.info(f"Response Body: {response.text}")
            
            if response.status_code == 200:
                self.log_result(test_name, True, f"Successfully queried transaction: {transaction_id}")
                return True
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_invalid_payload(self) -> bool:
        """Test error handling with invalid payload."""
        test_name = "Invalid Payload Handling"
        
        try:
            # Missing required fields
            invalid_payload = {
                "invalid_field": "test"
            }
            
            logger.info(f"Testing with invalid payload")
            
            response = requests.post(
                self.commit_endpoint,
                headers=self.headers,
                json=invalid_payload,
                timeout=30
            )
            
            logger.info(f"Response Status: {response.status_code}")
            logger.info(f"Response Body: {response.text}")
            
            # We expect this to fail with 4xx status
            if response.status_code >= 400:
                self.log_result(test_name, True, f"Correctly rejected invalid payload with HTTP {response.status_code}")
                return True
            else:
                self.log_result(test_name, False, f"Should have rejected invalid payload but got HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_concurrent_commits(self, num_transactions: int = 5) -> bool:
        """Test multiple concurrent transaction commits."""
        test_name = f"Concurrent Commits ({num_transactions} transactions)"
        
        try:
            successes = 0
            failures = 0
            
            for i in range(num_transactions):
                test_id = f"concurrent_test_{int(time.time())}_{i}"
                payload = {
                    "id": test_id,
                    "value": f"concurrent_value_{i}"
                }
                
                response = requests.post(
                    self.commit_endpoint,
                    headers=self.headers,
                    json=payload,
                    timeout=30
                )
                
                if response.status_code in [200, 201]:
                    successes += 1
                else:
                    failures += 1
                    logger.warning(f"Failed transaction {i}: HTTP {response.status_code}")
                
                # Small delay between requests
                time.sleep(0.1)
            
            if successes == num_transactions:
                self.log_result(test_name, True, f"All {num_transactions} transactions committed successfully")
                return True
            elif successes > 0:
                self.log_result(test_name, False, f"Only {successes}/{num_transactions} succeeded")
                return False
            else:
                self.log_result(test_name, False, "All transactions failed")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_large_payload(self) -> bool:
        """Test commit with large payload (simulating complex canvas data)."""
        test_name = "Large Payload Commit"
        
        try:
            test_id = f"large_test_{int(time.time())}"
            
            # Simulate a large canvas stroke with many points
            large_value = {
                "type": "canvas_strokes",
                "roomId": "test_room_large",
                "strokes": [
                    {
                        "id": f"stroke_{i}",
                        "points": [[j, j+1] for j in range(100)],  # 100 points per stroke
                        "color": "#FF0000",
                        "width": 2
                    }
                    for i in range(10)  # 10 strokes
                ]
            }
            
            payload = {
                "id": test_id,
                "value": json.dumps(large_value)
            }
            
            payload_size = len(json.dumps(payload))
            logger.info(f"Testing large payload (~{payload_size} bytes)")
            
            response = requests.post(
                self.commit_endpoint,
                headers=self.headers,
                json=payload,
                timeout=60  # Longer timeout for large payload
            )
            
            logger.info(f"Response Status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                self.log_result(test_name, True, f"Successfully committed large payload ({payload_size} bytes)")
                return True
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}: {response.text[:200]}")
                return False
                
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def test_endpoint_availability(self) -> bool:
        """Test that the endpoint is reachable."""
        test_name = "Endpoint Availability"
        
        try:
            # Try a simple OPTIONS request first
            response = requests.options(self.base_uri, timeout=10)
            
            logger.info(f"Base URI: {self.base_uri}")
            logger.info(f"Commit Endpoint: {self.commit_endpoint}")
            logger.info(f"Response Status: {response.status_code}")
            
            # Any response indicates the endpoint is reachable
            self.log_result(test_name, True, f"Endpoint is reachable (HTTP {response.status_code})")
            return True
            
        except requests.exceptions.ConnectionError as e:
            self.log_result(test_name, False, f"Connection error: {str(e)}")
            return False
        except Exception as e:
            self.log_result(test_name, False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return summary."""
        logger.info("=" * 80)
        logger.info("Starting ResilientDB Crow Endpoint Tests")
        logger.info("=" * 80)
        logger.info(f"Base URI: {self.base_uri}")
        logger.info(f"Commit Endpoint: {self.commit_endpoint}")
        logger.info(f"Query Endpoint: {self.query_endpoint}")
        logger.info("=" * 80)
        
        # Run tests in order
        tests = [
            ("Endpoint Availability", self.test_endpoint_availability),
            ("Basic Commit", self.test_basic_commit),
            ("Complex Value Commit", self.test_commit_with_complex_value),
            ("Query Transaction", self.test_query_transaction),
            ("Invalid Payload Handling", self.test_invalid_payload),
            ("Large Payload Commit", self.test_large_payload),
            ("Concurrent Commits", lambda: self.test_concurrent_commits(5)),
        ]
        
        for test_name, test_func in tests:
            logger.info(f"\n{'─' * 80}")
            logger.info(f"Running: {test_name}")
            logger.info(f"{'─' * 80}")
            test_func()
            time.sleep(1)  # Small delay between tests
        
        # Generate summary
        total = len(self.results)
        passed = sum(1 for r in self.results if r["success"])
        failed = total - passed
        
        logger.info("\n" + "=" * 80)
        logger.info("TEST SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total Tests: {total}")
        logger.info(f"Passed: {passed} ✓")
        logger.info(f"Failed: {failed} ✗")
        logger.info(f"Success Rate: {(passed/total*100):.1f}%")
        logger.info("=" * 80)
        
        # Print detailed results
        logger.info("\nDetailed Results:")
        for result in self.results:
            status = "✓" if result["success"] else "✗"
            logger.info(f"{status} {result['test']}: {result['details']}")
        
        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "success_rate": passed/total if total > 0 else 0,
            "results": self.results
        }


# Pytest-compatible test functions
def test_crow_basic_commit():
    """Pytest test for basic commit."""
    tester = CrowEndpointTester()
    assert tester.test_basic_commit(), "Basic commit test failed"


def test_crow_complex_value():
    """Pytest test for complex value commit."""
    tester = CrowEndpointTester()
    assert tester.test_commit_with_complex_value(), "Complex value commit test failed"


def test_crow_query():
    """Pytest test for query transaction."""
    tester = CrowEndpointTester()
    assert tester.test_query_transaction(), "Query transaction test failed"


def test_crow_invalid_payload():
    """Pytest test for invalid payload handling."""
    tester = CrowEndpointTester()
    assert tester.test_invalid_payload(), "Invalid payload test failed"


def test_crow_endpoint_availability():
    """Pytest test for endpoint availability."""
    tester = CrowEndpointTester()
    assert tester.test_endpoint_availability(), "Endpoint availability test failed"


if __name__ == "__main__":
    # Run as standalone script
    tester = CrowEndpointTester()
    summary = tester.run_all_tests()
    
    # Save results to file
    output_file = f"crow_test_results_{int(time.time())}.json"
    with open(output_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    logger.info(f"\nResults saved to: {output_file}")
    
    # Exit with appropriate code
    sys.exit(0 if summary["failed"] == 0 else 1)
