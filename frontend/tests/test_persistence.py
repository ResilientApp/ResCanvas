#!/usr/bin/env python3
"""
Test script to verify room undo/redo persistence after Redis flush
"""

import json
import requests
import time
import subprocess

API_BASE = "http://localhost:10010"

def test_register():
    """Register a test user"""
    payload = {"username": "testuser", "password": "testpass"}
    resp = requests.post(f"{API_BASE}/auth/register", json=payload)
    print(f"Register response: {resp.status_code} - {resp.text}")
    return resp.status_code in [200, 201]

def test_login():
    """Login and get JWT token"""
    payload = {"username": "testuser", "password": "testpass"}
    resp = requests.post(f"{API_BASE}/auth/login", json=payload)
    if resp.status_code == 200:
        return resp.json().get("token")  # The API returns "token" not "access_token"
    else:
        print(f"Login failed: {resp.text}")
        return None

def test_create_room(token):
    """Create a test room"""
    payload = {"name": "Test Room Persistence", "type": "public"}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms", json=payload, headers=headers)
    print(f"Create room response: {resp.status_code} - {resp.text}")
    if resp.status_code in [200, 201]:
        return resp.json().get("room", {}).get("id")
    else:
        print(f"Room creation failed: {resp.text}")
        return None

def test_post_stroke(token, room_id, drawing_id):
    """Post a test stroke to the room"""
    stroke = {
        "drawingId": drawing_id,
        "color": "#00FF00",
        "lineWidth": 3,
        "pathData": [{"x": 50, "y": 50}, {"x": 100, "y": 100}],
        "timestamp": int(time.time() * 1000)
    }
    payload = {"stroke": stroke}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes", json=payload, headers=headers)
    print(f"POST stroke response: {resp.status_code} - {resp.text}")
    return resp.status_code == 200

def test_get_strokes(token, room_id):
    """Get strokes from the room"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers)
    strokes = resp.json().get("strokes", [])
    print(f"GET strokes response: Found {len(strokes)} strokes")
    return strokes

def test_undo(token, room_id):
    """Test undo operation"""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo", headers=headers)
    print(f"UNDO response: {resp.status_code} - {resp.json().get('status')}")
    return resp.status_code == 200

def flush_redis():
    """Flush Redis cache"""
    try:
        subprocess.run(["redis-cli", "FLUSHALL"], check=True)
        print("✅ Redis flushed successfully")
        return True
    except subprocess.CalledProcessError:
        print("❌ Redis flush failed")
        return False

def main():
    print("=== Room Undo/Redo Persistence Test ===")
    
    # Step 0: Register user (in case it doesn't exist)
    test_register()
    
    # Step 1: Login
    token = test_login()
    if not token:
        print("❌ Login failed")
        return
    print("✅ Login successful")
    
    # Step 2: Create room  
    room_id = test_create_room(token)
    if not room_id:
        print("❌ Room creation failed")
        return
    print(f"✅ Room created: {room_id}")
    
    # Step 3: Post three strokes
    stroke_ids = []
    for i in range(3):
        drawing_id = f"test_stroke_{i}_{int(time.time())}"
        stroke_ids.append(drawing_id)
        if test_post_stroke(token, room_id, drawing_id):
            print(f"✅ Stroke {i+1} posted")
        else:
            print(f"❌ Stroke {i+1} failed")
            return
    
    # Step 4: Get strokes (should see all 3)
    strokes = test_get_strokes(token, room_id)
    print(f"✅ Found {len(strokes)} strokes initially")
    
    # Step 5: Undo two strokes  
    for i in range(2):
        if test_undo(token, room_id):
            print(f"✅ Undo {i+1} successful")
        else:
            print(f"❌ Undo {i+1} failed")
            return
    
    # Step 6: Get strokes after undo (should see 1)
    strokes = test_get_strokes(token, room_id)
    print(f"✅ Found {len(strokes)} strokes after undoing 2")
    
    # Step 7: FLUSH REDIS - This is the critical test!
    if not flush_redis():
        return
    
    # Step 8: Get strokes after Redis flush (should STILL see 1 if persistence works)
    print("\n🔥 CRITICAL TEST: Getting strokes after Redis flush...")
    strokes = test_get_strokes(token, room_id)
    
    if len(strokes) == 1:
        print("🎉 SUCCESS! Undo persistence works after Redis flush!")
        print(f"✅ Found {len(strokes)} stroke as expected")
    elif len(strokes) == 3:
        print("❌ FAILURE! Undone strokes reappeared after Redis flush")
        print(f"❌ Found {len(strokes)} strokes instead of 1")
    else:
        print(f"⚠️  Unexpected result: Found {len(strokes)} strokes")
    
    print("\n=== Test completed ===")

if __name__ == "__main__":
    main()