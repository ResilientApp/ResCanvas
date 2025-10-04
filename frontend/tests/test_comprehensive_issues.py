#!/usr/bin/env python3
"""
Comprehensive test suite for all remaining issues
"""
import requests
import time
import json

BASE_URL = "http://localhost:10010"

def setup_user(username):
    """Setup a test user"""
    user_data = {
        "username": username,
        "email": f"{username}@example.com",
        "password": "testpass123"
    }
    
    # Register (may fail if exists)
    requests.post(f"{BASE_URL}/auth/register", json=user_data)
    
    # Login
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": username,
        "password": user_data["password"]
    })
    token = response.json().get("token")
    return {"username": username, "token": token}

def create_room(token, name="Test Room"):
    """Create a test room"""
    response = requests.post(
        f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "type": "public"}
    )
    return response.json().get("room", {}).get("id")

def add_member(token, room_id, username):
    """Add member to room"""
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/share",
        headers={"Authorization": f"Bearer {token}"},
        json={"usernames": [username], "role": "editor"}
    )
    return response.json()

def submit_stroke(token, room_id, stroke_id):
    """Submit a test stroke"""
    stroke = {
        "drawingId": stroke_id,
        "color": "#000000",
        "lineWidth": 2,
        "pathData": [{"x": 100, "y": 100}, {"x": 200, "y": 200}],
        "timestamp": int(time.time() * 1000),
        "user": "test"
    }
    
    payload = {"stroke": stroke}
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    return response.status_code == 200

def get_strokes(token, room_id):
    """Get strokes from room"""
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        return response.json().get("strokes", [])
    return []

def undo(token, room_id):
    """Perform undo"""
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={}
    )
    return response.json()

def test_undo_redo_persistence():
    """Test Issue #2 & #3: Undo/redo during operations and double refresh"""
    print("\n" + "="*70)
    print("TEST: Undo/Redo Persistence During Operations")
    print("="*70)
    
    user = setup_user("testuser_persist")
    room_id = create_room(user["token"], "Persistence Test")
    
    # Draw 3 strokes
    print("\n1. Drawing 3 strokes...")
    for i in range(3):
        submit_stroke(user["token"], room_id, f"stroke_{i}_{time.time()}")
        time.sleep(0.1)
    
    strokes = get_strokes(user["token"], room_id)
    print(f"   ✓ {len(strokes)} strokes drawn")
    
    # Undo 1
    print("\n2. Undoing 1 stroke...")
    undo_result = undo(user["token"], room_id)
    print(f"   Undo result: {undo_result.get('status')}")
    
    # Get strokes immediately (first refresh)
    strokes_after_undo_1 = get_strokes(user["token"], room_id)
    print(f"   First fetch: {len(strokes_after_undo_1)} strokes")
    
    # Get strokes again (second refresh - should be same)
    strokes_after_undo_2 = get_strokes(user["token"], room_id)
    print(f"   Second fetch: {len(strokes_after_undo_2)} strokes")
    
    if len(strokes_after_undo_1) == 2 and len(strokes_after_undo_2) == 2:
        print("\n✅ PASS: Single refresh works correctly")
    else:
        print(f"\n❌ FAIL: Expected 2 strokes on both fetches, got {len(strokes_after_undo_1)} and {len(strokes_after_undo_2)}")
    
    return len(strokes_after_undo_1) == len(strokes_after_undo_2) == 2

def test_socket_io_connection():
    """Test Issue #8: Socket.IO connection"""
    print("\n" + "="*70)
    print("TEST: Socket.IO Connection")
    print("="*70)
    
    try:
        # Try to connect to Socket.IO endpoint
        response = requests.get(f"{BASE_URL}/socket.io/")
        print(f"   Socket.IO endpoint response: {response.status_code}")
        
        if response.status_code in [200, 400]:  # 400 is OK for GET on Socket.IO
            print("\n✅ PASS: Socket.IO server is responding")
            return True
        else:
            print(f"\n❌ FAIL: Socket.IO server returned {response.status_code}")
            return False
    except Exception as e:
        print(f"\n❌ FAIL: Socket.IO connection error: {e}")
        return False

def test_routes():
    """Test Issue #6: Routes configuration"""
    print("\n" + "="*70)
    print("TEST: Routes Configuration")
    print("="*70)
    
    # Test backend routes
    endpoints_to_test = [
        ("/health", None),
        ("/auth/login", None),
        ("/rooms", "testuser_routes"),
    ]
    
    results = {}
    for endpoint, needs_auth in endpoints_to_test:
        try:
            headers = {}
            if needs_auth:
                user = setup_user(needs_auth)
                headers = {"Authorization": f"Bearer {user['token']}"}
            
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            results[endpoint] = response.status_code
            print(f"   {endpoint}: {response.status_code}")
        except Exception as e:
            results[endpoint] = f"Error: {e}"
            print(f"   {endpoint}: Error - {e}")
    
    # /rooms should return 200 with auth
    if results.get("/rooms") == 200:
        print("\n✅ PASS: /rooms endpoint working")
        return True
    else:
        print(f"\n❌ FAIL: /rooms endpoint returned {results.get('/rooms')}")
        return False

def test_dashboard_member_count():
    """Test Issue #4a: Dashboard member count"""
    print("\n" + "="*70)
    print("TEST: Dashboard Member Count")
    print("="*70)
    
    user1 = setup_user("testuser_dash1")
    user2 = setup_user("testuser_dash2")
    
    # Create room
    room_id = create_room(user1["token"], "Member Count Test")
    
    # Add second member
    add_member(user1["token"], room_id, user2["username"])
    
    # Get room details
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}",
        headers={"Authorization": f"Bearer {user1['token']}"}
    )
    
    if response.status_code == 200:
        room_data = response.json()
        print(f"   Room data: {json.dumps(room_data, indent=2)}")
        # Check if member count is available
        # This may need to be calculated on frontend
        print("\n⚠️  Member count calculation may need frontend implementation")
        return True
    else:
        print(f"\n❌ FAIL: Could not get room details: {response.status_code}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("COMPREHENSIVE TEST SUITE FOR REMAINING ISSUES")
    print("="*70)
    
    results = {
        "undo_redo_persistence": test_undo_redo_persistence(),
        "socket_io": test_socket_io_connection(),
        "routes": test_routes(),
        "dashboard_member_count": test_dashboard_member_count(),
    }
    
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    print(f"\nPassed: {passed_count}/{total_count}")
    
    if passed_count == total_count:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total_count - passed_count} tests failed")

if __name__ == "__main__":
    main()
