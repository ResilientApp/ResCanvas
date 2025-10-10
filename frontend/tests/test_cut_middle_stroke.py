#!/usr/bin/env python3
"""
Test script specifically for the cut middle of stroke scenario
This simulates the exact issue described - cutting the middle of a stroke
and verifying it persists after refresh
"""
import requests
import json
import time

API_BASE = "http://localhost:10010"

def test_cut_middle_of_stroke():
    print("=== CUT MIDDLE OF STROKE TEST ===\n")
    
    # Login as testuser
    login_resp = requests.post(f"{API_BASE}/auth/login", json={
        "username": "testuser",
        "password": "testpass"
    })
    
    if login_resp.status_code != 200:
        print("❌ Failed to login as testuser")
        return False
    
    token = login_resp.json()["token"]
    user = login_resp.json()["user"]
    print(f"✅ Logged in as {user['username']}")
    
    # Use the specific room mentioned: 68d32b48d56fc59130dcaf40
    room_id = "68d32b48d56fc59130dcaf40"
    
    # First, clear any existing strokes in this room to start fresh
    print(f"🧹 Clearing room {room_id} for clean test...")
    clear_resp = requests.post(f"{API_BASE}/rooms/{room_id}/clear", 
        headers={"Authorization": f"Bearer {token}"})
    print(f"   Clear result: {clear_resp.status_code}")
    
    # Step 1: Draw a single long stroke (that can be cut in the middle)
    print("\n1️⃣ Drawing a long stroke...")
    stroke_id = f"long_stroke_{int(time.time() * 1000)}"
    long_stroke = {
        "drawingId": stroke_id,
        "color": "#000000",
        "lineWidth": 5,
        "pathData": [  # A long horizontal line that can be cut in the middle
            {"x": 50, "y": 100},
            {"x": 100, "y": 100},
            {"x": 150, "y": 100},
            {"x": 200, "y": 100},
            {"x": 250, "y": 100},
        ],
        "timestamp": int(time.time() * 1000),
        "user": user["username"],
        "roomId": room_id
    }
    
    add_resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": long_stroke}
    )
    
    if add_resp.status_code != 200:
        print(f"❌ Failed to add stroke: {add_resp.status_code} {add_resp.text}")
        return False
    
    print(f"✅ Added long stroke: {stroke_id}")
    
    # Step 2: Verify stroke is present
    strokes_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes = strokes_resp.json().get("strokes", [])
    stroke_ids = {s["drawingId"] for s in strokes}
    
    if stroke_id not in stroke_ids:
        print(f"❌ Original stroke not found after adding")
        return False
    
    print(f"✅ Original stroke present: {len(strokes)} total strokes")
    
    # Step 3: Simulate cutting the middle of the stroke
    print("\n2️⃣ Cutting the middle of the stroke...")
    
    # Simulate what the frontend does: create replacement segments outside the cut area
    # Original stroke: x=50 to x=250, we cut x=125 to x=175 (middle section)
    # This should create two replacement segments: x=50-125 and x=175-250
    
    # Replacement segment 1 (left part)
    replacement1_id = f"repl_1_{int(time.time() * 1000)}"
    replacement1 = {
        "drawingId": replacement1_id,
        "color": "#000000",
        "lineWidth": 5,
        "pathData": [
            {"x": 50, "y": 100},
            {"x": 100, "y": 100},
            {"x": 125, "y": 100},  # Cut at x=125
        ],
        "timestamp": int(time.time() * 1000),
        "user": user["username"],
        "roomId": room_id
    }
    
    # Replacement segment 2 (right part)
    replacement2_id = f"repl_2_{int(time.time() * 1000)}"
    replacement2 = {
        "drawingId": replacement2_id,
        "color": "#000000",
        "lineWidth": 5,
        "pathData": [
            {"x": 175, "y": 100},  # Resume at x=175
            {"x": 200, "y": 100},
            {"x": 250, "y": 100},
        ],
        "timestamp": int(time.time() * 1000),
        "user": user["username"],
        "roomId": room_id
    }
    
    # Add replacement segments
    for i, repl in enumerate([replacement1, replacement2], 1):
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": repl}
        )
        if resp.status_code == 200:
            print(f"   ✅ Added replacement segment {i}: {repl['drawingId']}")
        else:
            print(f"   ❌ Failed to add replacement segment {i}: {resp.status_code}")
            return False
    
    # Create the cut record to mark the original stroke as cut
    cut_record_id = f"cut_record_{int(time.time() * 1000)}"
    cut_record = {
        "drawingId": cut_record_id,
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 125, "y": 95, "width": 50, "height": 10},  # Cut area x=125-175
            "cut": True,
            "originalStrokeIds": [stroke_id]
        },
        "timestamp": int(time.time() * 1000),
        "user": user["username"],
        "roomId": room_id
    }
    
    cut_resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_record}
    )
    
    if cut_resp.status_code == 200:
        print(f"   ✅ Created cut record: {cut_record_id}")
    else:
        print(f"   ❌ Failed to create cut record: {cut_resp.status_code}")
        return False
    
    # Step 4: Verify the cut is effective immediately
    print("\n3️⃣ Verifying immediate cut effect...")
    
    immediate_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    immediate_strokes = immediate_resp.json().get("strokes", [])
    immediate_ids = {s["drawingId"] for s in immediate_strokes}
    
    # Original stroke should be hidden, replacements should be visible
    if stroke_id in immediate_ids:
        print(f"   ❌ Original stroke still visible after cut")
        print(f"   Visible strokes: {immediate_ids}")
        return False
    
    expected_visible = {replacement1_id, replacement2_id, cut_record_id}
    visible_expected = expected_visible.intersection(immediate_ids)
    
    if len(visible_expected) == len(expected_visible):
        print(f"   ✅ Cut is effective - original hidden, replacements visible")
    else:
        print(f"   ❌ Some expected strokes missing: {expected_visible - visible_expected}")
        return False
    
    # Step 5: Test persistence through multiple "refreshes"
    print("\n4️⃣ Testing persistence across multiple refreshes...")
    
    for i in range(5):
        time.sleep(0.5)  # Simulate user delay
        
        refresh_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        refresh_strokes = refresh_resp.json().get("strokes", [])
        refresh_ids = {s["drawingId"] for s in refresh_strokes}
        
        # Check that original stroke is still hidden
        if stroke_id in refresh_ids:
            print(f"   ❌ Refresh {i+1}: Original stroke reappeared!")
            print(f"   All strokes: {refresh_ids}")
            return False
        
        # Check that replacement segments are still present
        visible_replacements = {replacement1_id, replacement2_id}.intersection(refresh_ids)
        if len(visible_replacements) != 2:
            print(f"   ❌ Refresh {i+1}: Replacement segments missing: {visible_replacements}")
            return False
        
        print(f"   ✅ Refresh {i+1}: Cut persists correctly")
    
    print("\n🎉 CUT MIDDLE OF STROKE TEST PASSED!")
    print("   ✅ Original stroke correctly hidden")
    print("   ✅ Replacement segments persist") 
    print("   ✅ Cut operation survives multiple refreshes")
    
    return True

if __name__ == "__main__":
    if test_cut_middle_of_stroke():
        print("\n🚀 The cut functionality is working correctly!")
    else:
        print("\n❌ Cut functionality has issues that need to be resolved")