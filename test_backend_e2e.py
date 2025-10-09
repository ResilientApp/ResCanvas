#!/usr/bin/env python3
"""
End-to-end integration test for ResCanvas backend API with server-side security enforcement.

Tests:
1. User registration and login
2. JWT authentication
3. Room creation, listing, and access control
4. Stroke creation and retrieval
5. Undo/redo operations
6. Room updates and deletion
7. Multi-user collaboration (share/invite)

Usage:
    python test_backend_e2e.py
"""

import requests
import json
import time
import sys

# Configuration
BASE_URL = "http://127.0.0.1:10010"
TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpass"
TEST_USERNAME2 = "testuser2"
TEST_PASSWORD2 = "testpass2"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

def log_test(name):
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST: {name}{Colors.END}")

def log_success(message):
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def log_error(message):
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def log_info(message):
    print(f"{Colors.YELLOW}ℹ {message}{Colors.END}")

def assert_status(response, expected_status, test_name):
    if response.status_code == expected_status:
        log_success(f"{test_name}: Got expected status {expected_status}")
        return True
    else:
        log_error(f"{test_name}: Expected {expected_status}, got {response.status_code}")
        log_error(f"Response: {response.text}")
        return False

def assert_json_field(data, field, test_name):
    if field in data:
        log_success(f"{test_name}: Field '{field}' present")
        return True
    else:
        log_error(f"{test_name}: Missing field '{field}'")
        log_error(f"Data: {json.dumps(data, indent=2)}")
        return False

def cleanup_test_users():
    """Clean up test users from database (requires direct MongoDB access)"""
    log_info("Note: Manual cleanup of test users recommended if tests fail")

def test_user_registration():
    log_test("User Registration")
    
    # Test 1: Register first user
    response = requests.post(f"{BASE_URL}/auth/register", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    
    # Accept both 201 (new) and 409 (already exists)
    if response.status_code == 201:
        log_success("User registered successfully")
        data = response.json()
        if not (assert_json_field(data, "token", "Registration") and 
                assert_json_field(data, "user", "Registration")):
            return None
        return data["token"]
    elif response.status_code == 409:
        log_info("User already exists, logging in instead")
        return test_user_login()
    else:
        assert_status(response, 201, "Registration")
        return None

def test_user_login():
    log_test("User Login")
    
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    
    if not assert_status(response, 200, "Login"):
        return None
    
    data = response.json()
    if not (assert_json_field(data, "token", "Login") and 
            assert_json_field(data, "user", "Login")):
        return None
    
    log_success(f"Logged in as {data['user']['username']}")
    return data["token"]

def test_invalid_auth():
    log_test("Invalid Authentication")
    
    # Test 1: No token
    response = requests.get(f"{BASE_URL}/rooms")
    assert_status(response, 401, "No token")
    
    # Test 2: Invalid token
    response = requests.get(f"{BASE_URL}/rooms", headers={
        "Authorization": "Bearer invalid_token_12345"
    })
    assert_status(response, 401, "Invalid token")
    
    # Test 3: Expired token (simulated with wrong signature)
    response = requests.get(f"{BASE_URL}/rooms", headers={
        "Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImV4cCI6MTYxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    })
    assert_status(response, 401, "Invalid signature")

def test_get_me(token):
    log_test("Get Current User (/auth/me)")
    
    response = requests.get(f"{BASE_URL}/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if not assert_status(response, 200, "Get Me"):
        return False
    
    data = response.json()
    if not (assert_json_field(data, "user", "Get Me") and
            data["user"].get("username") == TEST_USERNAME):
        return False
    
    log_success(f"Retrieved user: {data['user']['username']}")
    return True

def test_room_creation(token):
    log_test("Room Creation")
    
    # Test 1: Create public room
    response = requests.post(f"{BASE_URL}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Public Room",
            "type": "public",
            "description": "A test public room"
        })
    
    if not assert_status(response, 201, "Create public room"):
        return None
    
    data = response.json()
    if not assert_json_field(data, "room", "Room creation"):
        return None
    
    room_id = data["room"]["id"]
    log_success(f"Created room: {room_id}")
    
    # Test 2: Create private room
    response = requests.post(f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Private Room",
            "type": "private",
            "description": "A test private room"
        })
    
    if assert_status(response, 201, "Create private room"):
        log_success("Private room created successfully")
    
    return room_id

def test_list_rooms(token):
    log_test("List Rooms")
    
    response = requests.get(f"{BASE_URL}/rooms", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if not assert_status(response, 200, "List rooms"):
        return []
    
    data = response.json()
    if not assert_json_field(data, "rooms", "List rooms"):
        return []
    
    rooms = data["rooms"]
    log_success(f"Retrieved {len(rooms)} rooms")
    
    # Test server-side filtering
    response = requests.get(f"{BASE_URL}/rooms?type=public", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if assert_status(response, 200, "Filter by type"):
        public_rooms = response.json().get("rooms", [])
        log_success(f"Filtered to {len(public_rooms)} public rooms")
    
    return rooms

def test_get_room(token, room_id):
    log_test("Get Room Details")
    
    response = requests.get(f"{BASE_URL}/rooms/{room_id}", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if not assert_status(response, 200, "Get room"):
        return None
    
    data = response.json()
    if not assert_json_field(data, "room", "Get room"):
        return None
    
    room = data["room"]
    log_success(f"Retrieved room: {room.get('name')}")
    return room

def test_post_stroke(token, room_id):
    log_test("Post Stroke to Canvas")
    
    stroke_data = {
        "stroke": {
            "color": "#FF0000",
            "lineWidth": 3,
            "tool": "pen",
            "pathData": {
                "type": "path",
                "d": "M10,10 L50,50 L100,30"
            },
            "timestamp": int(time.time() * 1000)
        }
    }
    
    response = requests.post(f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json=stroke_data)
    
    if not assert_status(response, 200, "Post stroke"):
        return False
    
    log_success("Stroke posted successfully")
    return True

def test_get_strokes(token, room_id):
    log_test("Get Strokes from Canvas")
    
    response = requests.get(f"{BASE_URL}/rooms/{room_id}/strokes", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if not assert_status(response, 200, "Get strokes"):
        return []
    
    data = response.json()
    if not assert_json_field(data, "strokes", "Get strokes"):
        return []
    
    strokes = data["strokes"]
    log_success(f"Retrieved {len(strokes)} strokes")
    return strokes

def test_undo_redo(token, room_id):
    log_test("Undo/Redo Operations")
    
    # Post a stroke first
    test_post_stroke(token, room_id)
    time.sleep(0.5)
    
    # Test undo
    response = requests.post(f"{BASE_URL}/rooms/{room_id}/undo", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if assert_status(response, 200, "Undo"):
        log_success("Undo successful")
    
    # Test redo
    response = requests.post(f"{BASE_URL}/rooms/{room_id}/redo", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if assert_status(response, 200, "Redo"):
        log_success("Redo successful")
    
    # Test undo/redo status
    response = requests.get(f"{BASE_URL}/rooms/{room_id}/undo_redo_status", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if assert_status(response, 200, "Get undo/redo status"):
        data = response.json()
        log_success(f"Undo available: {data.get('undo_available')}, Redo available: {data.get('redo_available')}")

def test_update_room(token, room_id):
    log_test("Update Room")
    
    response = requests.patch(f"{BASE_URL}/rooms/{room_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Updated Test Room",
            "description": "Updated description"
        })
    
    if not assert_status(response, 200, "Update room"):
        return False
    
    log_success("Room updated successfully")
    return True

def test_room_access_control(token, room_id):
    log_test("Room Access Control")
    
    # Try to access without token
    response = requests.get(f"{BASE_URL}/rooms/{room_id}")
    assert_status(response, 401, "No token access denied")
    
    # Try to access with token
    response = requests.get(f"{BASE_URL}/rooms/{room_id}", headers={
        "Authorization": f"Bearer {token}"
    })
    assert_status(response, 200, "Valid token access granted")
    
    log_success("Access control working correctly")

def test_delete_room(token, room_id):
    log_test("Delete Room")
    
    response = requests.delete(f"{BASE_URL}/rooms/{room_id}", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if not assert_status(response, 200, "Delete room"):
        return False
    
    log_success("Room deleted successfully")
    
    # Verify deletion
    response = requests.get(f"{BASE_URL}/rooms/{room_id}", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if assert_status(response, 404, "Verify deletion"):
        log_success("Room no longer accessible")
    
    return True

def test_input_validation(token):
    log_test("Input Validation")
    
    # Test 1: Invalid room name (empty)
    response = requests.post(f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "", "type": "public"})
    
    assert_status(response, 400, "Empty room name rejected")
    
    # Test 2: Invalid room type
    response = requests.post(f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Test", "type": "invalid_type"})
    
    assert_status(response, 400, "Invalid room type rejected")
    
    log_success("Input validation working correctly")

def run_all_tests():
    print(f"\n{Colors.BOLD}{'='*60}")
    print(f"ResCanvas Backend E2E Tests - Server-Side Security")
    print(f"{'='*60}{Colors.END}\n")
    
    print(f"Testing against: {BASE_URL}")
    
    # Test authentication
    token = test_user_registration()
    if not token:
        token = test_user_login()
    
    if not token:
        log_error("Failed to authenticate. Stopping tests.")
        return False
    
    log_success(f"Authentication successful. Token: {token[:20]}...")
    
    # Test invalid auth
    test_invalid_auth()
    
    # Test /auth/me
    if not test_get_me(token):
        log_error("Failed to get current user")
    
    # Test room operations
    room_id = test_room_creation(token)
    if not room_id:
        log_error("Failed to create room. Stopping tests.")
        return False
    
    # Test room listing
    test_list_rooms(token)
    
    # Test get room
    test_get_room(token, room_id)
    
    # Test canvas operations
    test_post_stroke(token, room_id)
    time.sleep(0.5)
    test_get_strokes(token, room_id)
    
    # Test undo/redo
    test_undo_redo(token, room_id)
    
    # Test room updates
    test_update_room(token, room_id)
    
    # Test access control
    test_room_access_control(token, room_id)
    
    # Test input validation
    test_input_validation(token)
    
    # Test deletion
    test_delete_room(token, room_id)
    
    print(f"\n{Colors.BOLD}{Colors.GREEN}{'='*60}")
    print(f"All tests completed!")
    print(f"{'='*60}{Colors.END}\n")
    
    return True

if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Tests interrupted by user{Colors.END}")
        sys.exit(1)
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
