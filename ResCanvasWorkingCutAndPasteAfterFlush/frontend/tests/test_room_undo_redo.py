#!/usr/bin/env python3
"""
Test script to verify room undo/redo functionality matches legacy behavior
"""

import json
import requests
import time

API_BASE = "http://127.0.0.1:10010"

def test_register():
    """Register a test user"""
    try:
        resp = requests.post(f"{API_BASE}/register", json={
            "username": "testuser_room_legacy", 
            "password": "testpass123"
        })
        print(f"Register: {resp.status_code} - {resp.text}")
        return resp.status_code == 201
    except Exception as e:
        print(f"Register failed: {e}")
        return False

def test_login():
    """Login and get JWT token"""
    try:
        resp = requests.post(f"{API_BASE}/login", json={
            "username": "testuser_room_legacy", 
            "password": "testpass123"
        })
        print(f"Login: {resp.status_code} - {resp.text}")
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        return None
    except Exception as e:
        print(f"Login failed: {e}")
        return None

def test_create_room(token):
    """Create a test room"""
    try:
        resp = requests.post(f"{API_BASE}/rooms", 
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Legacy Test Room", "type": "public"})
        print(f"Create room: {resp.status_code} - {resp.text}")
        if resp.status_code == 201:
            data = resp.json()
            return data["room"]["id"]
        return None
    except Exception as e:
        print(f"Create room failed: {e}")
        return None

def test_post_stroke(token, room_id, drawing_id):
    """Post a test stroke to the room"""
    try:
        stroke = {
            "id": drawing_id,
            "color": "#FF0000",
            "lineWidth": 5,
            "pathData": [{"x": 100, "y": 100}, {"x": 200, "y": 200}],
            "timestamp": int(time.time() * 1000)
        }
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke})
        print(f"Post stroke {drawing_id}: {resp.status_code} - {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Post stroke failed: {e}")
        return False

def test_get_strokes(token, room_id):
    """Get strokes from the room"""
    try:
        resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"})
        print(f"Get strokes: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            strokes = data.get("strokes", [])
            print(f"  Found {len(strokes)} strokes")
            for stroke in strokes:
                print(f"    {stroke.get('id')} - {stroke.get('color')}")
            return strokes
        return []
    except Exception as e:
        print(f"Get strokes failed: {e}")
        return []

def test_undo(token, room_id):
    """Test undo operation"""
    try:
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
            headers={"Authorization": f"Bearer {token}"})
        print(f"Undo: {resp.status_code} - {resp.text}")
        return resp.status_code == 200 and resp.json().get("status") == "ok"
    except Exception as e:
        print(f"Undo failed: {e}")
        return False

def test_redo(token, room_id):
    """Test redo operation"""
    try:
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/redo",
            headers={"Authorization": f"Bearer {token}"})
        print(f"Redo: {resp.status_code} - {resp.text}")
        return resp.status_code == 200 and resp.json().get("status") == "ok"
    except Exception as e:
        print(f"Redo failed: {e}")
        return False

def test_undo_redo_status(token, room_id):
    """Test undo/redo status endpoint"""
    try:
        resp = requests.get(f"{API_BASE}/rooms/{room_id}/undo_redo_status",
            headers={"Authorization": f"Bearer {token}"})
        print(f"Undo/Redo status: {resp.status_code} - {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Undo/Redo status failed: {e}")
        return False

def main():
    print("=== Testing Room Undo/Redo with Legacy-Style Filtering ===")
    
    # Register and login
    if not test_register():
        print("Registration failed - user might already exist, continuing...")
    
    token = test_login()
    if not token:
        print("❌ Login failed, aborting test")
        return
    
    # Create room
    room_id = test_create_room(token)
    if not room_id:
        print("❌ Room creation failed, aborting test")
        return
    
    print(f"\n✅ Created room: {room_id}")
    
    # Test the exact user scenario from the bug report:
    print("\n--- Step 1: Drawing 3 strokes ---")
    strokes = ["drawing_test_001", "drawing_test_002", "drawing_test_003"] 
    for stroke_id in strokes:
        if not test_post_stroke(token, room_id, stroke_id):
            print(f"❌ Failed to post stroke {stroke_id}")
            return
    
    print("\n--- Step 2: Check initial strokes (should see all 3) ---")
    initial_strokes = test_get_strokes(token, room_id)
    if len(initial_strokes) != 3:
        print(f"❌ Expected 3 strokes, got {len(initial_strokes)}")
        return
    print("✅ All 3 strokes visible initially")
    
    print("\n--- Step 3: Undo last 2 strokes ---")
    if not test_undo(token, room_id):
        print("❌ First undo failed")
        return
    if not test_undo(token, room_id):
        print("❌ Second undo failed") 
        return
    print("✅ Undo operations completed")
    
    print("\n--- Step 4: Check strokes after undo (should see only 1) ---")
    after_undo_strokes = test_get_strokes(token, room_id)
    if len(after_undo_strokes) != 1:
        print(f"❌ Expected 1 stroke after undo, got {len(after_undo_strokes)}")
        return
    print("✅ Correct filtering: only 1 stroke visible after undo")
    
    test_undo_redo_status(token, room_id)
    
    print("\n--- Step 5: Redo the 2 strokes ---")
    if not test_redo(token, room_id):
        print("❌ First redo failed")
        return
    if not test_redo(token, room_id):
        print("❌ Second redo failed")
        return
    print("✅ Redo operations completed")
    
    print("\n--- Step 6: Check strokes after redo (should see all 3 again) ---")
    after_redo_strokes = test_get_strokes(token, room_id)
    if len(after_redo_strokes) != 3:
        print(f"❌ Expected 3 strokes after redo, got {len(after_redo_strokes)}")
        return
    print("✅ Correct filtering: all 3 strokes visible after redo")
    
    print("\n--- Step 7: Multiple refresh simulation (the critical test) ---")
    for i in range(5):
        print(f"  Refresh {i+1}:")
        refresh_strokes = test_get_strokes(token, room_id)
        if len(refresh_strokes) != 3:
            print(f"    ❌ Expected 3 strokes on refresh {i+1}, got {len(refresh_strokes)}")
            print("    This indicates the redo persistence issue is not fixed!")
            return
        print(f"    ✅ {len(refresh_strokes)} strokes (correct)")
    
    print("\n🎉 TEST PASSED!")
    print("\nKey behaviors verified:")
    print("✅ Backend filtering works (undone strokes not returned)")
    print("✅ Redo persistence works (redone strokes stay visible)")
    print("✅ Multiple refreshes maintain correct state")
    print("✅ Timestamp-based undo/redo state resolution working")
    print("\nThe room-based undo/redo now matches legacy behavior!")

if __name__ == "__main__":
    main()