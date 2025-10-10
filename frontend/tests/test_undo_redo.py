#!/usr/bin/env python3
"""
Test script to verify room undo/redo functionality
"""

import json
import requests
import time

API_BASE = "http://127.0.0.1:10010"

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
    payload = {"name": "Test Room", "type": "public"}
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
        "color": "#FF0000",
        "lineWidth": 5,
        "pathData": [{"x": 10, "y": 10}, {"x": 20, "y": 20}],
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
    print(f"GET strokes response: {resp.status_code} - {resp.text}")
    if resp.status_code == 200:
        return resp.json().get("strokes", [])
    return []

def test_undo(token, room_id):
    """Test undo operation"""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo", headers=headers)
    print(f"UNDO response: {resp.status_code} - {resp.text}")
    return resp.status_code == 200

def test_redo(token, room_id):
    """Test redo operation"""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms/{room_id}/redo", headers=headers)
    print(f"REDO response: {resp.status_code} - {resp.text}")
    return resp.status_code == 200

def main():
    print("=== Room Undo/Redo Test ===")
    
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
    
    # Step 3: Post first stroke
    drawing_id_1 = f"test_stroke_1_{int(time.time())}"
    if test_post_stroke(token, room_id, drawing_id_1):
        print("✅ First stroke posted")
    else:
        print("❌ First stroke failed")
        return
    
    # Step 4: Post second stroke
    drawing_id_2 = f"test_stroke_2_{int(time.time())}"
    if test_post_stroke(token, room_id, drawing_id_2):
        print("✅ Second stroke posted")
    else:
        print("❌ Second stroke failed")
        return
    
    # Step 5: Get strokes (should see both)
    strokes = test_get_strokes(token, room_id)
    print(f"✅ Found {len(strokes)} strokes before undo")
    
    # Step 6: Undo one stroke
    if test_undo(token, room_id):
        print("✅ Undo successful")
    else:
        print("❌ Undo failed")
        return
    
    # Step 7: Get strokes (should see one less)
    strokes = test_get_strokes(token, room_id)
    print(f"✅ Found {len(strokes)} strokes after undo")
    
    # Step 8: Redo the stroke
    if test_redo(token, room_id):
        print("✅ Redo successful")
    else:
        print("❌ Redo failed")
        return
    
    # Step 9: Get strokes (should see both again)
    strokes = test_get_strokes(token, room_id)
    print(f"✅ Found {len(strokes)} strokes after redo")
    
    print("=== Test completed ===")

if __name__ == "__main__":
    main()