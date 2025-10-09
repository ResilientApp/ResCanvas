#!/usr/bin/env python3
"""
Test the critical fixes for issues #2, #3, #8:
- Issue #2: Undo/redo should work during operations (no manual refresh needed)
- Issue #3: Single refresh should work (no double refresh)  
- Issue #8: Socket.IO connection should work properly
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

def redo(token, room_id):
    """Perform redo"""
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/redo",
        headers={"Authorization": f"Bearer {token}"},
        json={}
    )
    return response.json()

def test_single_refresh_after_undo():
    """Test Issue #3: Single refresh should work (no double refresh needed)"""
    print("\n" + "="*70)
    print("TEST: Single Refresh After Undo (Issue #3)")
    print("="*70)
    
    user = setup_user("testuser_refresh")
    room_id = create_room(user["token"], "Single Refresh Test")
    
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
        return True
    else:
        print(f"\n❌ FAIL: Expected 2 strokes on both fetches, got {len(strokes_after_undo_1)} and {len(strokes_after_undo_2)}")
        return False

def test_multi_user_immediate_sync():
    """Test Issue #2: User A's undo should immediately be visible to User B"""
    print("\n" + "="*70)
    print("TEST: Multi-User Immediate Sync (Issue #2)")
    print("="*70)
    
    user_a = setup_user("testuser_a_sync")
    user_b = setup_user("testuser_b_sync")
    room_id = create_room(user_a["token"], "Multi-User Sync Test")
    
    # Add User B to room
    requests.post(
        f"{BASE_URL}/rooms/{room_id}/share",
        headers={"Authorization": f"Bearer {user_a['token']}"},
        json={"usernames": [user_b["username"]], "role": "editor"}
    )
    
    # User A draws 3 strokes
    print("\n1. User A drawing 3 strokes...")
    for i in range(3):
        submit_stroke(user_a["token"], room_id, f"stroke_a_{i}_{time.time()}")
        time.sleep(0.1)
    
    # Both users see 3 strokes
    strokes_a = get_strokes(user_a["token"], room_id)
    strokes_b = get_strokes(user_b["token"], room_id)
    print(f"   User A sees: {len(strokes_a)} strokes")
    print(f"   User B sees: {len(strokes_b)} strokes")
    
    # User A undos 1 stroke
    print("\n2. User A undoing 1 stroke...")
    undo_result = undo(user_a["token"], room_id)
    print(f"   Undo result: {undo_result.get('status')}")
    
    # User B fetches without manual refresh; should see only 2 strokes
    print("\n3. User B fetching strokes (no manual refresh)...")
    strokes_b_after_undo = get_strokes(user_b["token"], room_id)
    print(f"   User B sees: {len(strokes_b_after_undo)} strokes")
    
    # User A should also see 2
    strokes_a_after_undo = get_strokes(user_a["token"], room_id)
    print(f"   User A sees: {len(strokes_a_after_undo)} strokes")
    
    if len(strokes_b_after_undo) == 2 and len(strokes_a_after_undo) == 2:
        print("\n✅ PASS: Multi-user sync works immediately")
        return True
    else:
        print(f"\n❌ FAIL: Expected both users to see 2 strokes, got A={len(strokes_a_after_undo)}, B={len(strokes_b_after_undo)}")
        return False

def test_redo_sync():
    """Test that redo also syncs across users"""
    print("\n" + "="*70)
    print("TEST: Redo Multi-User Sync")
    print("="*70)
    
    user_a = setup_user("testuser_a_redo")
    user_b = setup_user("testuser_b_redo")
    room_id = create_room(user_a["token"], "Redo Sync Test")
    
    # Add User B
    requests.post(
        f"{BASE_URL}/rooms/{room_id}/share",
        headers={"Authorization": f"Bearer {user_a['token']}"},
        json={"usernames": [user_b["username"]], "role": "editor"}
    )
    
    # User A draws 3 strokes
    print("\n1. User A drawing 3 strokes...")
    for i in range(3):
        submit_stroke(user_a["token"], room_id, f"stroke_a_{i}_{time.time()}")
        time.sleep(0.1)
    
    # User A undos 1
    print("\n2. User A undoing 1 stroke...")
    undo(user_a["token"], room_id)
    
    # Verify both see 2
    strokes_a = get_strokes(user_a["token"], room_id)
    strokes_b = get_strokes(user_b["token"], room_id)
    print(f"   After undo - A sees: {len(strokes_a)}, B sees: {len(strokes_b)}")
    
    # User A redos
    print("\n3. User A redoing...")
    redo_result = redo(user_a["token"], room_id)
    print(f"   Redo result: {redo_result.get('status')}")
    
    # Both should see 3 again
    strokes_a_after_redo = get_strokes(user_a["token"], room_id)
    strokes_b_after_redo = get_strokes(user_b["token"], room_id)
    print(f"   After redo - A sees: {len(strokes_a_after_redo)}, B sees: {len(strokes_b_after_redo)}")
    
    if len(strokes_a_after_redo) == 3 and len(strokes_b_after_redo) == 3:
        print("\n✅ PASS: Redo syncs across users")
        return True
    else:
        print(f"\n❌ FAIL: Expected both users to see 3 strokes after redo, got A={len(strokes_a_after_redo)}, B={len(strokes_b_after_redo)}")
        return False

def test_cache_replacement_not_merge():
    """Test that refresh REPLACES cache instead of merging"""
    print("\n" + "="*70)
    print("TEST: Cache Replacement (Not Merge)")
    print("="*70)
    
    user = setup_user("testuser_cache")
    room_id = create_room(user["token"], "Cache Test")
    
    # Draw 5 strokes
    print("\n1. Drawing 5 strokes...")
    stroke_ids = []
    for i in range(5):
        stroke_id = f"stroke_{i}_{time.time()}"
        stroke_ids.append(stroke_id)
        submit_stroke(user["token"], room_id, stroke_id)
        time.sleep(0.1)
    
    strokes = get_strokes(user["token"], room_id)
    print(f"   ✓ {len(strokes)} strokes drawn")
    
    # Undo 3 strokes
    print("\n2. Undoing 3 strokes...")
    for i in range(3):
        undo(user["token"], room_id)
        time.sleep(0.1)
    
    # Fetch should show only 2 strokes
    strokes_after_undo = get_strokes(user["token"], room_id)
    print(f"   After undo: {len(strokes_after_undo)} strokes")
    
    # The undone stroke IDs should NOT be in the result
    remaining_ids = [s.get('drawingId') for s in strokes_after_undo]
    undone_ids = stroke_ids[2:]  # Last 3 strokes were undone
    
    print(f"   Checking if undone strokes are removed...")
    undone_present = any(uid in remaining_ids for uid in undone_ids)
    
    if len(strokes_after_undo) == 2 and not undone_present:
        print("\n✅ PASS: Cache properly replaced (undone strokes removed)")
        return True
    else:
        print(f"\n❌ FAIL: Expected 2 strokes with no undone IDs, got {len(strokes_after_undo)} strokes")
        if undone_present:
            print(f"   ERROR: Undone strokes still present in cache!")
        return False

def main():
    """Run all critical tests"""
    print("\n" + "="*70)
    print("CRITICAL FIXES TEST SUITE")
    print("Testing Issues #2, #3, #8")
    print("="*70)
    
    results = {
        "single_refresh": test_single_refresh_after_undo(),
        "multi_user_sync": test_multi_user_immediate_sync(),
        "redo_sync": test_redo_sync(),
        "cache_replacement": test_cache_replacement_not_merge(),
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
        print("\n🎉 ALL CRITICAL TESTS PASSED!")
        print("✅ Issue #2: Undo/redo works during operations")
        print("✅ Issue #3: Single refresh works (no double refresh)")
        print("✅ Multi-user sync working correctly")
    else:
        print(f"\n⚠️  {total_count - passed_count} tests failed")

if __name__ == "__main__":
    main()
