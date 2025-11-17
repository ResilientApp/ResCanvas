#!/usr/bin/env python3
"""
Quick diagnostic script to test connectivity to Crow API.

Usage:
    python test_crow_connectivity.py
"""

import requests
import time
import socket

CROW_BASE_URL = "https://crow.resilientdb.com"
COMMIT_ENDPOINT = f"{CROW_BASE_URL}/v1/transactions/commit"

def test_dns_resolution():
    """Test DNS resolution."""
    print("="*60)
    print("DNS Resolution Test")
    print("="*60)
    try:
        hostname = "crow.resilientdb.com"
        ip = socket.gethostbyname(hostname)
        print(f"✓ SUCCESS: {hostname} resolves to {ip}")
        return True
    except Exception as e:
        print(f"✗ ERROR: DNS resolution failed - {str(e)}")
        return False

def test_basic_connectivity():
    """Test basic HTTP connectivity."""
    print("\n" + "="*60)
    print("Basic Connectivity Test")
    print("="*60)
    try:
        print(f"Testing: {CROW_BASE_URL}")
        response = requests.get(CROW_BASE_URL, timeout=10)
        print(f"✓ SUCCESS: Connected (HTTP {response.status_code})")
        return True
    except requests.exceptions.Timeout:
        print("✗ ERROR: Connection timed out")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"✗ ERROR: Connection error - {str(e)}")
        return False
    except Exception as e:
        print(f"✗ ERROR: {str(e)}")
        return False

def test_commit_endpoint_simple():
    """Test commit endpoint with minimal payload."""
    print("\n" + "="*60)
    print("Commit Endpoint Test (Short Timeout)")
    print("="*60)
    try:
        payload = {
            "id": f"test_{int(time.time())}",
            "value": "test"
        }
        print(f"Endpoint: {COMMIT_ENDPOINT}")
        print(f"Payload: {payload}")
        print("Timeout: 10 seconds")
        
        response = requests.post(
            COMMIT_ENDPOINT,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code in [200, 201]:
            print("✓ SUCCESS: Endpoint is responsive")
            return True
        else:
            print(f"⚠ WARNING: Unexpected status {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print("✗ ERROR: Request timed out (endpoint may be slow or down)")
        return False
    except Exception as e:
        print(f"✗ ERROR: {str(e)}")
        return False

def test_with_retry():
    """Test with retry logic."""
    print("\n" + "="*60)
    print("Commit Endpoint Test (With Retry)")
    print("="*60)
    
    max_retries = 3
    timeout = 15
    
    for attempt in range(1, max_retries + 1):
        try:
            payload = {
                "id": f"retry_test_{int(time.time())}",
                "value": "retry_value"
            }
            
            print(f"\nAttempt {attempt}/{max_retries}")
            print(f"Timeout: {timeout}s")
            
            response = requests.post(
                COMMIT_ENDPOINT,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=timeout
            )
            
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
            if response.status_code in [200, 201]:
                print(f"✓ SUCCESS: Endpoint responded on attempt {attempt}")
                return True
            else:
                print(f"⚠ Got HTTP {response.status_code}, retrying...")
                
        except requests.exceptions.Timeout:
            print(f"✗ Timeout on attempt {attempt}")
            if attempt < max_retries:
                wait_time = 2 * attempt
                print(f"Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
        except Exception as e:
            print(f"✗ Error: {str(e)}")
            if attempt < max_retries:
                time.sleep(2)
    
    print(f"\n✗ FAILED: All {max_retries} attempts failed")
    return False

def main():
    """Run all diagnostic tests."""
    print("\n" + "="*60)
    print("ResilientDB Crow Connectivity Diagnostic")
    print("="*60)
    print(f"Target: {CROW_BASE_URL}")
    print(f"Current Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print("="*60)
    
    results = []
    
    # Test 1: DNS
    results.append(("DNS Resolution", test_dns_resolution()))
    
    # Test 2: Basic connectivity
    results.append(("Basic Connectivity", test_basic_connectivity()))
    
    # Test 3: Commit endpoint
    results.append(("Commit Endpoint", test_commit_endpoint_simple()))
    
    # Test 4: Retry logic
    results.append(("With Retry", test_with_retry()))
    
    # Summary
    print("\n" + "="*60)
    print("DIAGNOSTIC SUMMARY")
    print("="*60)
    
    for test_name, success in results:
        status = "✓" if success else "✗"
        print(f"{status} {test_name}")
    
    passed = sum(1 for _, s in results if s)
    total = len(results)
    
    print(f"\nPassed: {passed}/{total}")
    
    if passed == 0:
        print("\n⚠ DIAGNOSIS: No connectivity to Crow endpoint")
        print("Possible causes:")
        print("  - Crow API is temporarily down")
        print("  - Network firewall blocking HTTPS traffic")
        print("  - DNS issues")
        print("  - VPN/proxy configuration")
        print("\nRecommendations:")
        print("  1. Check if you can access https://crow.resilientdb.com in browser")
        print("  2. Try: curl -v https://crow.resilientdb.com")
        print("  3. Check firewall: sudo iptables -L")
        print("  4. Contact ResilientDB team for API status")
    elif passed < total:
        print("\n⚠ DIAGNOSIS: Partial connectivity issues")
        print("The endpoint may be experiencing high load or intermittent issues.")
    else:
        print("\n✓ All connectivity tests passed!")
    
    print("="*60 + "\n")
    
    return passed > 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
