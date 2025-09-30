#!/usr/bin/env python3
"""
Frontend integration test to verify cut functionality works through the actual JWT canvas system
"""
import requests
import json
import time
import sys

API_BASE = "http://localhost:10010"

def test_auth_flow():
    """Test the full authentication flow"""
    # Register new user with timestamp
    username = f"cuttest_{int(time.time())}"
    password = "testpass123"
    
    # Register
    reg_response = requests.post(f"{API_BASE}/auth/register", json={
        "username": username,
        "password": password,
        "email": f"{username}@test.com"
    })
    
    if reg_response.status_code != 201:
        print(f"Registration failed: {reg_response.status_code} {reg_response.text}")
        return None, None
    
    # Login
    login_response = requests.post(f"{API_BASE}/auth/login", json={
        "username": username,
        "password": password
    })
    
    if login_response.status_code != 200:
        print(f"Login failed: {login_response.status_code} {login_response.text}")
        return None, None
    
    token = login_response.json()["token"]
    user_info = login_response.json()["user"]
    print(f"✅ Authenticated as {username}")
    return token, user_info

def test_frontend_cut_simulation():
    """Simulate the exact frontend cut workflow"""
    print("=== Frontend Cut Workflow Simulation ===\n")
    
    # Step 1: Authenticate
    token, user = test_auth_flow()
    if not token:
        print("❌ Authentication failed")
        return
    
    # Step 2: Create room
    room_response = requests.post(f"{API_BASE}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Frontend Cut Test", "type": "public"}
    )
    
    if room_response.status_code != 201:
        print(f"❌ Room creation failed: {room_response.status_code}")
        return
    
    room_id = room_response.json()["room"]["id"]
    print(f"✅ Created room: {room_id}")
    
    # Step 3: Add strokes as frontend would
    print("\n📝 Adding drawing strokes...")
    
    # Simulate drawing strokes with realistic data structures
    strokes = [
        {
            "drawingId": f"stroke_1_{int(time.time() * 1000)}",
            "color": "#000000",
            "lineWidth": 5,
            "pathData": [{"x": 100, "y": 100}, {"x": 120, "y": 120}],  # Inside cut area
            "timestamp": int(time.time() * 1000),
            "user": user["username"]
        },
        {
            "drawingId": f"stroke_2_{int(time.time() * 1000)}",
            "color": "#ff0000", 
            "lineWidth": 3,
            "pathData": [{"x": 110, "y": 110}, {"x": 130, "y": 130}],  # Inside cut area
            "timestamp": int(time.time() * 1000),
            "user": user["username"]
        },
        {
            "drawingId": f"stroke_3_{int(time.time() * 1000)}",
            "color": "#00ff00",
            "lineWidth": 7,
            "pathData": [{"x": 200, "y": 200}, {"x": 220, "y": 220}],  # Outside cut area
            "timestamp": int(time.time() * 1000), 
            "user": user["username"]
        }
    ]
    
    # Submit each stroke
    stroke_ids = []
    for stroke in strokes:
        response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke}
        )
        if response.status_code == 200:
            stroke_ids.append(stroke["drawingId"])
            print(f"✅ Added stroke: {stroke['drawingId']}")
        else:
            print(f"❌ Failed to add stroke: {response.status_code}")
            return
    
    # Step 4: Verify initial state
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    initial_strokes = response.json().get("strokes", [])
    print(f"\n📊 Initial state: {len(initial_strokes)} strokes")
    
    # Step 5: Simulate frontend cut operation
    print("\n✂️ Performing cut operation...")
    
    # The frontend creates erase strokes for visual feedback
    erase_strokes = []
    for i, stroke_id in enumerate(stroke_ids[:2]):  # First two strokes are in cut area
        erase_stroke = {
            "drawingId": f"erase_{stroke_id}_{int(time.time() * 1000)}",
            "color": "#ffffff",
            "lineWidth": 9,  # Slightly thicker than original
            "pathData": strokes[i]["pathData"],  # Same path as original
            "timestamp": int(time.time() * 1000),
            "user": user["username"]
        }
        
        response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": erase_stroke}
        )
        
        if response.status_code == 200:
            print(f"✅ Added erase stroke for {stroke_id}")
            erase_strokes.append(erase_stroke)
        else:
            print(f"❌ Failed to add erase stroke: {response.status_code}")
    
    # Create the cut record (this should mark the original strokes as cut)
    cut_record = {
        "drawingId": f"cut_record_{int(time.time() * 1000)}",
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 90, "y": 90, "width": 50, "height": 50},
            "cut": True,
            "originalStrokeIds": stroke_ids[:2]  # First two strokes
        },
        "timestamp": int(time.time() * 1000),
        "user": user["username"]
    }
    
    response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_record}
    )
    
    if response.status_code == 200:
        print(f"✅ Cut record created: {cut_record['drawingId']}")
    else:
        print(f"❌ Cut record failed: {response.status_code} {response.text}")
        return
    
    # Step 6: Verify cut effectiveness immediately
    print("\n🔍 Checking immediate cut effect...")
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    immediate_strokes = response.json().get("strokes", [])
    immediate_ids = {s["drawingId"] for s in immediate_strokes}
    
    # Should not see the original cut strokes, but should see:
    # - The non-cut stroke (stroke_3)
    # - The erase strokes  
    # - The cut record
    cut_stroke_ids = set(stroke_ids[:2])
    remaining_visible = immediate_ids - cut_stroke_ids
    
    if not cut_stroke_ids.intersection(immediate_ids):
        print("✅ Cut strokes immediately hidden")
    else:
        print(f"❌ Cut strokes still visible: {cut_stroke_ids.intersection(immediate_ids)}")
        return
    
    # Step 7: Test persistence through multiple refreshes
    print("\n🔄 Testing persistence across refreshes...")
    for i in range(5):
        time.sleep(0.5)  # Small delay to simulate real usage
        response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code != 200:
            print(f"❌ Refresh {i+1} failed: {response.status_code}")
            return
        
        refresh_strokes = response.json().get("strokes", [])
        refresh_ids = {s["drawingId"] for s in refresh_strokes}
        
        # Check that cut strokes are still hidden
        if cut_stroke_ids.intersection(refresh_ids):
            print(f"❌ Refresh {i+1}: Cut strokes reappeared! {cut_stroke_ids.intersection(refresh_ids)}")
            return
        else:
            print(f"✅ Refresh {i+1}: Cut strokes remain hidden")
    
    # Step 8: Verify final state
    print(f"\n📊 Final verification:")
    print(f"   - Original strokes: {len(stroke_ids)}")
    print(f"   - Cut strokes: {len(cut_stroke_ids)}")
    print(f"   - Visible strokes: {len(refresh_strokes)}")
    print(f"   - Cut strokes hidden: {'✅' if not cut_stroke_ids.intersection(refresh_ids) else '❌'}")
    
    # Verify expected strokes are still present
    expected_visible = {stroke_ids[2]}  # Only stroke_3 should be visible from originals
    if expected_visible.issubset(refresh_ids):
        print("✅ Non-cut strokes still visible")
    else:
        print("❌ Some non-cut strokes missing")
        return
    
    print("\n🎉 Frontend cut workflow test PASSED!")
    print("   Cut functionality is working correctly in the JWT room system!")

if __name__ == "__main__":
    test_frontend_cut_simulation()