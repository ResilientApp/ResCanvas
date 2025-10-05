#!/usr/bin/env python3
"""
Test script to verify cut functionality in JWT-based room system
"""
import requests
import json
import time
import sys

API_BASE = "http://localhost:10010"

def test_login():
    """Test login to get JWT token"""
    response = requests.post(f"{API_BASE}/auth/login", json={
        "username": "testuser", 
        "password": "testpass"
    })
    if response.status_code == 200:
        return response.json()["token"]
    else:
        # Try to register first
        reg_response = requests.post(f"{API_BASE}/auth/register", json={
            "username": "testuser",
            "password": "testpass", 
            "email": "test@test.com"
        })
        if reg_response.status_code == 201:
            login_response = requests.post(f"{API_BASE}/auth/login", json={
                "username": "testuser",
                "password": "testpass"
            })
            if login_response.status_code == 200:
                return login_response.json()["token"]
    
    print("Failed to get auth token")
    return None

def test_create_room(token):
    """Create a test room"""
    response = requests.post(f"{API_BASE}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Cut Test Room", "type": "public"}
    )
    if response.status_code == 201:
        return response.json()["room"]["id"]
    else:
        print(f"Failed to create room: {response.status_code} {response.text}")
        return None

def test_post_stroke(token, room_id, stroke_id, path_data):
    """Post a stroke to the room"""
    stroke_data = {
        "drawingId": stroke_id,
        "color": "#000000",
        "lineWidth": 5,
        "pathData": path_data,
        "timestamp": int(time.time() * 1000)
    }
    
    response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": stroke_data}
    )
    
    success = response.status_code == 200
    print(f"Post stroke {stroke_id}: {'✅' if success else '❌'} ({response.status_code})")
    return success

def test_post_cut_record(token, room_id, cut_id, original_stroke_ids):
    """Post a cut record"""
    cut_data = {
        "drawingId": cut_id,
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 40, "y": 40, "width": 20, "height": 20},
            "cut": True,
            "originalStrokeIds": original_stroke_ids
        },
        "timestamp": int(time.time() * 1000)
    }
    
    response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_data}
    )
    
    success = response.status_code == 200
    print(f"Post cut record {cut_id}: {'✅' if success else '❌'} ({response.status_code})")
    return success

def test_get_strokes(token, room_id):
    """Get strokes from the room"""
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code == 200:
        strokes = response.json().get("strokes", [])
        print(f"Retrieved {len(strokes)} strokes")
        return strokes
    else:
        print(f"Failed to get strokes: {response.status_code} {response.text}")
        return []

def main():
    print("=== JWT Cut Functionality Test ===\n")
    
    # Step 1: Get authentication token
    print("1. Getting authentication token...")
    token = test_login()
    if not token:
        print("❌ Failed to get token")
        return
    print("✅ Got authentication token\n")
    
    # Step 2: Create test room
    print("2. Creating test room...")
    room_id = test_create_room(token)
    if not room_id:
        print("❌ Failed to create room")
        return
    print(f"✅ Created room: {room_id}\n")
    
    # Step 3: Add some test strokes
    print("3. Adding test strokes...")
    stroke1_id = f"test_stroke_1_{int(time.time())}"
    stroke2_id = f"test_stroke_2_{int(time.time())}"
    stroke3_id = f"test_stroke_3_{int(time.time())}"
    
    # Stroke 1: in cut area
    test_post_stroke(token, room_id, stroke1_id, [[45, 45], [55, 55]])
    # Stroke 2: in cut area  
    test_post_stroke(token, room_id, stroke2_id, [[50, 50], [60, 60]])
    # Stroke 3: outside cut area
    test_post_stroke(token, room_id, stroke3_id, [[70, 70], [80, 80]])
    
    # Step 4: Verify all strokes are present
    print("\n4. Verifying strokes before cut...")
    strokes = test_get_strokes(token, room_id)
    stroke_ids = {s.get("drawingId") for s in strokes}
    expected_ids = {stroke1_id, stroke2_id, stroke3_id}
    
    if expected_ids.issubset(stroke_ids):
        print("✅ All 3 strokes present before cut")
    else:
        print(f"❌ Missing strokes before cut. Expected {expected_ids}, got {stroke_ids}")
        return
    
    # Step 5: Perform cut operation
    print("\n5. Performing cut operation...")
    cut_id = f"cut_record_{int(time.time())}"
    cut_success = test_post_cut_record(token, room_id, cut_id, [stroke1_id, stroke2_id])
    
    if not cut_success:
        print("❌ Cut operation failed")
        return
    
    # Step 6: Verify cut strokes are hidden
    print("\n6. Verifying strokes after cut...")
    strokes_after_cut = test_get_strokes(token, room_id)
    stroke_ids_after = {s.get("drawingId") for s in strokes_after_cut}
    
    # Should only see stroke3 and the cut record
    if stroke3_id in stroke_ids_after and stroke1_id not in stroke_ids_after and stroke2_id not in stroke_ids_after:
        print("✅ Cut strokes are properly hidden")
    else:
        print(f"❌ Cut filtering failed. Expected stroke3 and cut record, got: {stroke_ids_after}")
        return
    
    # Step 7: Test persistence across "refresh" (multiple API calls)
    print("\n7. Testing persistence across refreshes...")
    for i in range(3):
        print(f"   Refresh #{i+1}")
        refresh_strokes = test_get_strokes(token, room_id)
        refresh_ids = {s.get("drawingId") for s in refresh_strokes}
        
        if stroke3_id in refresh_ids and stroke1_id not in refresh_ids and stroke2_id not in refresh_ids:
            print(f"   ✅ Refresh {i+1}: Cut persists correctly")
        else:
            print(f"   ❌ Refresh {i+1}: Cut persistence failed - {refresh_ids}")
            return
    
    print("\n🎉 All tests passed! Cut functionality is working correctly.")

if __name__ == "__main__":
    main()