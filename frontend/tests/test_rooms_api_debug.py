#!/usr/bin/env python3
"""
Test the rooms API directly to see undo markers in action
"""

import requests
import json
import time

API_BASE = "http://localhost:10010"

def test_rooms_api_debug():
    print("=== Testing Rooms API Debug ===")
    
    # Login first
    login_data = {"username": "test_user", "password": "test_pass"}
    resp = requests.post(f"{API_BASE}/login", json=login_data)
    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        return
    
    token = resp.json()["token"]
    print(f"✅ Login successful")
    
    # Create a room
    room_data = {"name": "Debug Room", "type": "public"}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{API_BASE}/rooms", json=room_data, headers=headers)
    if resp.status_code != 201:
        print(f"Room creation failed: {resp.text}")
        return
    
    room_id = resp.json()["room"]["id"]
    print(f"✅ Room created: {room_id}")
    
    # Post 3 strokes
    for i in range(3):
        drawing_id = f"debug_stroke_{i}_{int(time.time() * 1000)}"
        stroke = {
            "drawingId": drawing_id,
            "id": drawing_id,  # Ensure both id and drawingId are set
            "color": "#FF0000",
            "lineWidth": 2,
            "pathData": [{"x": i * 10, "y": i * 10}, {"x": i * 10 + 20, "y": i * 10 + 20}],
            "timestamp": int(time.time() * 1000)
        }
        payload = {"stroke": stroke}
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes", json=payload, headers=headers)
        if resp.status_code == 200:
            print(f"✅ Stroke {i+1} posted: {drawing_id}")
        else:
            print(f"❌ Stroke {i+1} failed: {resp.text}")
    
    # Get strokes (should see 3)
    resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers)
    if resp.status_code == 200:
        strokes = resp.json()["strokes"]
        print(f"✅ Initial strokes: {len(strokes)}")
    else:
        print(f"❌ Get strokes failed: {resp.text}")
        return
    
    # Undo 2 strokes
    for i in range(2):
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo", headers=headers)
        if resp.status_code == 200:
            print(f"✅ Undo {i+1} successful")
        else:
            print(f"❌ Undo {i+1} failed: {resp.text}")
    
    # Get strokes (should see 1)
    resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers)
    if resp.status_code == 200:
        strokes = resp.json()["strokes"]
        print(f"✅ After undo strokes: {len(strokes)}")
    else:
        print(f"❌ Get strokes after undo failed: {resp.text}")
    
    # Flush Redis
    print("\n🔥 Flushing Redis...")
    import redis
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    redis_client.flushall()
    print("✅ Redis flushed")
    
    # Get strokes again (should STILL see 1 if persistence works)
    print("\n🔥 CRITICAL TEST: Getting strokes after Redis flush...")
    resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers)
    if resp.status_code == 200:
        strokes = resp.json()["strokes"]
        print(f"Result: {len(strokes)} strokes")
        if len(strokes) == 1:
            print("🎉 SUCCESS! Undo persistence works!")
        else:
            print("❌ FAILURE! Undo persistence broken")
        
        # Print actual stroke IDs for debugging
        print("Stroke IDs returned:")
        for stroke in strokes:
            stroke_id = stroke.get("id") or stroke.get("drawingId") 
            print(f"  - {stroke_id}")
    else:
        print(f"❌ Get strokes after Redis flush failed: {resp.text}")

if __name__ == "__main__":
    test_rooms_api_debug()