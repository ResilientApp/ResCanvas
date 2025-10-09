#!/usr/bin/env python3
"""
Final Verification Test for Server-Side Security Refactoring
Tests that all critical endpoints have proper middleware decorators
"""

import requests
import json
import sys

BASE_URL = "http://127.0.0.1:10010"
COLORS = {
    'green': '\033[92m',
    'red': '\033[91m',
    'blue': '\033[94m',
    'yellow': '\033[93m',
    'reset': '\033[0m'
}

def print_status(message, status="info"):
    colors = {
        'pass': COLORS['green'] + '✓',
        'fail': COLORS['red'] + '✗',
        'info': COLORS['blue'] + 'ℹ'
    }
    print(f"{colors.get(status, '')} {message}{COLORS['reset']}")

def test_auth_required():
    """Test that endpoints require authentication"""
    print("\n" + "="*60)
    print("Testing Authentication Enforcement")
    print("="*60)
    
    endpoints_requiring_auth = [
        ("GET", "/rooms"),
        ("GET", "/users/suggest"),
        ("GET", "/rooms/suggest"),
        ("GET", "/auth/me"),
    ]
    
    passed = 0
    failed = 0
    
    for method, endpoint in endpoints_requiring_auth:
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            else:
                response = requests.post(f"{BASE_URL}{endpoint}", json={}, timeout=5)
            
            if response.status_code == 401:
                print_status(f"{method} {endpoint}: Returns 401 without auth", "pass")
                passed += 1
            else:
                print_status(f"{method} {endpoint}: Expected 401, got {response.status_code}", "fail")
                failed += 1
        except Exception as e:
            print_status(f"{method} {endpoint}: Error - {str(e)}", "fail")
            failed += 1
    
    return passed, failed

def test_validation():
    """Test that input validation works"""
    print("\n" + "="*60)
    print("Testing Input Validation")
    print("="*60)
    
    passed = 0
    failed = 0
    
    # Test invalid registration data
    invalid_data = [
        ({"username": "ab", "password": "test123"}, "short username"),
        ({"username": "validuser", "password": "123"}, "short password"),
        ({"username": "", "password": "test123"}, "empty username"),
    ]
    
    for data, description in invalid_data:
        try:
            response = requests.post(f"{BASE_URL}/auth/register", json=data, timeout=5)
            if response.status_code == 400:
                print_status(f"Validation rejects {description}", "pass")
                passed += 1
            else:
                print_status(f"Validation should reject {description}, got {response.status_code}", "fail")
                failed += 1
        except Exception as e:
            print_status(f"Validation test ({description}): Error - {str(e)}", "fail")
            failed += 1
    
    return passed, failed

def test_login_and_access():
    """Test full authentication flow"""
    print("\n" + "="*60)
    print("Testing Full Authentication Flow")
    print("="*60)
    
    passed = 0
    failed = 0
    
    # Test login
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "testuser", "password": "testpass"},
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'token' in data:
                token = data['token']
                print_status("Login successful with valid credentials", "pass")
                passed += 1
                
                # Test authenticated endpoint
                headers = {"Authorization": f"Bearer {token}"}
                me_response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=5)
                
                if me_response.status_code == 200:
                    print_status("Authenticated endpoint accessible with valid token", "pass")
                    passed += 1
                else:
                    print_status(f"Authenticated endpoint failed: {me_response.status_code}", "fail")
                    failed += 1
                
                # Test room listing
                rooms_response = requests.get(f"{BASE_URL}/rooms", headers=headers, timeout=5)
                if rooms_response.status_code == 200:
                    print_status("Room listing accessible with valid token", "pass")
                    passed += 1
                else:
                    print_status(f"Room listing failed: {rooms_response.status_code}", "fail")
                    failed += 1
            else:
                print_status("Login response missing token", "fail")
                failed += 1
        else:
            print_status(f"Login failed: {response.status_code}", "fail")
            failed += 1
    except Exception as e:
        print_status(f"Authentication flow error: {str(e)}", "fail")
        failed += 3
    
    return passed, failed

def main():
    print("\n" + "="*60)
    print("ResCanvas Server-Side Security - Final Verification")
    print("="*60)
    print(f"Testing against: {BASE_URL}\n")
    
    total_passed = 0
    total_failed = 0
    
    # Run all test suites
    passed, failed = test_auth_required()
    total_passed += passed
    total_failed += failed
    
    passed, failed = test_validation()
    total_passed += passed
    total_failed += failed
    
    passed, failed = test_login_and_access()
    total_passed += passed
    total_failed += failed
    
    # Summary
    print("\n" + "="*60)
    print("FINAL RESULTS")
    print("="*60)
    print(f"{COLORS['green']}Passed: {total_passed}{COLORS['reset']}")
    print(f"{COLORS['red']}Failed: {total_failed}{COLORS['reset']}")
    print(f"Total: {total_passed + total_failed}")
    
    if total_failed == 0:
        print(f"\n{COLORS['green']}🎉 ALL TESTS PASSED - SERVER-SIDE SECURITY IS COMPLETE{COLORS['reset']}")
        return 0
    else:
        print(f"\n{COLORS['red']}⚠ SOME TESTS FAILED - REVIEW REQUIRED{COLORS['reset']}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
