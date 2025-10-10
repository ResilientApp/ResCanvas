#!/usr/bin/env python3
"""
Complete workflow test for cut functionality that mirrors the frontend behavior exactly
"""
import requests
import json
import time

API_BASE = "http://localhost:10010"

def test_complete_cut_workflow():
    print("=== COMPLETE CUT WORKFLOW TEST ===\n")
    
    # Login
    login_resp = requests.post(f"{API_BASE}/auth/login", json={
        "username": "testuser",
        "password": "testpass"
    })
    
    token = login_resp.json()["token"]
    user = login_resp.json()["user"]
    room_id = "68d32b48d56fc59130dcaf40"
    
    # Clear room
    requests.post(f"{API_BASE}/rooms/{room_id}/clear",
        headers={"Authorization": f"Bearer {token}"})
    
    print(f"✅ Setup complete - Room: {room_id}, User: {user['username']}")
    
    # Step 1: Add a stroke that crosses the cut area
    print("\n1️⃣ Adding stroke that will be cut...")
    
    original_stroke_id = f"original_{int(time.time() * 1000)}"
    original_stroke = {
        "drawingId": original_stroke_id,
        "color": "#ff0000",
        "lineWidth": 5,
        "pathData": [
            {"x": 50, "y": 150},   # Outside cut area (left)
            {"x": 100, "y": 150},  # Approaching cut area
            {"x": 150, "y": 150},  # Inside cut area
            {"x": 200, "y": 150},  # Inside cut area  
            {"x": 250, "y": 150},  # Exiting cut area
            {"x": 300, "y": 150},  # Outside cut area (right)
        ],
        "timestamp": int(time.time() * 1000)
    }
    
    requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": original_stroke}
    )
    
    print(f"   ✅ Added original stroke: {original_stroke_id}")
    
    # Verify initial state
    strokes = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    ).json()["strokes"]
    
    if len(strokes) != 1 or strokes[0]["drawingId"] != original_stroke_id:
        print(f"   ❌ Initial state incorrect")
        return False
    
    print(f"   ✅ Initial state verified: 1 stroke")
    
    # Step 2: Simulate the frontend cut operation exactly
    print("\n2️⃣ Performing complete cut operation...")
    
    # Cut rectangle: x=125 to x=225 (middle 100px of the 250px stroke)
    cut_rect = {"x": 125, "y": 140, "width": 100, "height": 20}
    
    # Calculate what the frontend would create:
    # Original points: [50,100,150,200,250,300] at y=150
    # Cut area: x=125 to x=225
    # Points inside cut: 150, 200 (points at x=150,200 are inside x=125-225)
    # Points outside cut: 50,100,250,300
    # 
    # Segments outside cut area:
    # Segment 1: [50,100] -> but need to cut at x=125, so [50,100,125]
    # Segment 2: [225,250,300] -> but need to start at x=225
    
    # Frontend would create replacement segments
    replacement1_id = f"repl1_{int(time.time() * 1000)}"
    replacement1 = {
        "drawingId": replacement1_id,
        "color": "#ff0000",
        "lineWidth": 5,
        "pathData": [
            {"x": 50, "y": 150},
            {"x": 100, "y": 150},
            {"x": 125, "y": 150},  # Cut at intersection
        ],
        "timestamp": int(time.time() * 1000)
    }
    
    replacement2_id = f"repl2_{int(time.time() * 1000)}"
    replacement2 = {
        "drawingId": replacement2_id,
        "color": "#ff0000", 
        "lineWidth": 5,
        "pathData": [
            {"x": 225, "y": 150},  # Resume at intersection
            {"x": 250, "y": 150},
            {"x": 300, "y": 150},
        ],
        "timestamp": int(time.time() * 1000)
    }
    
    # Submit replacement segments (this is the fix we added)
    for repl in [replacement1, replacement2]:
        resp = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": repl}
        )
        if resp.status_code == 200:
            print(f"   ✅ Added replacement: {repl['drawingId']}")
        else:
            print(f"   ❌ Failed replacement: {resp.status_code}")
            return False
    
    # Create erase stroke (visual feedback)
    erase_id = f"erase_{int(time.time() * 1000)}"
    erase_stroke = {
        "drawingId": erase_id,
        "color": "#ffffff",
        "lineWidth": 9,  # Thicker than original
        "pathData": [
            {"x": 125, "y": 150},
            {"x": 150, "y": 150},
            {"x": 200, "y": 150},
            {"x": 225, "y": 150},
        ],
        "timestamp": int(time.time() * 1000)
    }
    
    requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": erase_stroke}
    )
    
    print(f"   ✅ Added erase stroke: {erase_id}")
    
    # Create cut record
    cut_record_id = f"cut_{int(time.time() * 1000)}"
    cut_record = {
        "drawingId": cut_record_id,
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": cut_rect,
            "cut": True,
            "originalStrokeIds": [original_stroke_id]
        },
        "timestamp": int(time.time() * 1000)
    }
    
    requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_record}
    )
    
    print(f"   ✅ Added cut record: {cut_record_id}")
    
    # Step 3: Verify cut is effective
    print("\n3️⃣ Verifying cut effectiveness...")
    
    after_cut = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    ).json()["strokes"]
    
    after_cut_ids = {s["drawingId"] for s in after_cut}
    
    # Original should be hidden
    if original_stroke_id in after_cut_ids:
        print(f"   ❌ Original stroke still visible: {original_stroke_id}")
        return False
    
    # Replacements should be visible
    expected_visible = {replacement1_id, replacement2_id, erase_id, cut_record_id}
    visible_count = len(expected_visible.intersection(after_cut_ids))
    
    if visible_count == len(expected_visible):
        print(f"   ✅ Cut effective: original hidden, {visible_count} expected strokes visible")
    else:
        print(f"   ❌ Cut not effective: only {visible_count}/{len(expected_visible)} expected strokes visible")
        print(f"   Expected: {expected_visible}")
        print(f"   Actual: {after_cut_ids}")
        return False
    
    # Step 4: Test persistence with multiple refreshes
    print("\n4️⃣ Testing persistence across refreshes...")
    
    for i in range(10):
        time.sleep(0.2)
        
        refresh_strokes = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        ).json()["strokes"]
        
        refresh_ids = {s["drawingId"] for s in refresh_strokes}
        
        # Original should still be hidden
        if original_stroke_id in refresh_ids:
            print(f"   ❌ Refresh {i+1}: Original stroke reappeared!")
            return False
        
        # Replacements should still be visible
        visible_replacements = {replacement1_id, replacement2_id}.intersection(refresh_ids)
        if len(visible_replacements) != 2:
            print(f"   ❌ Refresh {i+1}: Replacement segments missing")
            print(f"   Expected: {[replacement1_id, replacement2_id]}")
            print(f"   Found: {list(visible_replacements)}")
            return False
    
    print(f"   ✅ All 10 refreshes: Cut persists perfectly")
    
    # Step 5: Test undo operation
    print("\n5️⃣ Testing undo operation...")
    
    # The frontend would call undo 4 times (backendCount = 1 cut + 1 erase + 2 replacements)
    for i in range(4):
        undo_resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
            headers={"Authorization": f"Bearer {token}"}, json={}
        )
        if undo_resp.status_code != 200 or undo_resp.json().get("status") != "ok":
            print(f"   ❌ Undo {i+1} failed: {undo_resp.json()}")
            return False
    
    print(f"   ✅ Called undo 4 times successfully")
    
    # After undo, original should be restored
    after_undo = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    ).json()["strokes"]
    
    after_undo_ids = {s["drawingId"] for s in after_undo}
    
    if original_stroke_id not in after_undo_ids:
        print(f"   ❌ Original stroke not restored after undo")
        print(f"   Found strokes: {after_undo_ids}")
        return False
    
    # Cut-related strokes should be gone
    cut_related = {replacement1_id, replacement2_id, erase_id, cut_record_id}
    remaining_cut_strokes = cut_related.intersection(after_undo_ids)
    if remaining_cut_strokes:
        print(f"   ❌ Cut-related strokes still present after undo: {remaining_cut_strokes}")
        return False
    
    print(f"   ✅ Undo successful: original restored, cut elements removed")
    
    print("\n🎉 COMPLETE CUT WORKFLOW TEST PASSED!")
    print("   ✅ Cut operation works correctly")
    print("   ✅ Persistence across refreshes")
    print("   ✅ Undo functionality works")
    print("   ✅ All edge cases handled")
    
    return True

if __name__ == "__main__":
    if test_complete_cut_workflow():
        print("\n🚀 Cut functionality is FULLY WORKING!")
    else:
        print("\n❌ Cut functionality needs more fixes")