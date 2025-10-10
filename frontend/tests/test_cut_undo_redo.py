#!/usr/bin/env python3
"""
Test cut operations with undo/redo functionality in JWT rooms
"""
import requests
import json
import time

API_BASE = "http://localhost:10010"

def get_auth():
    """Get authentication token"""
    username = f"undotest_{int(time.time())}"
    
    # Register and login
    requests.post(f"{API_BASE}/auth/register", json={
        "username": username, "password": "test123", "email": f"{username}@test.com"
    })
    
    response = requests.post(f"{API_BASE}/auth/login", json={
        "username": username, "password": "test123"
    })
    
    return response.json()["token"], response.json()["user"]

def test_cut_undo_redo():
    print("=== Cut + Undo/Redo Test ===\n")
    
    # Setup
    token, user = get_auth()
    
    # Create room
    room_resp = requests.post(f"{API_BASE}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Undo Test Room", "type": "public"}
    )
    room_id = room_resp.json()["room"]["id"]
    print(f"✅ Created room: {room_id}")
    
    # Add test strokes
    strokes = []
    for i in range(3):
        stroke = {
            "drawingId": f"test_stroke_{i}_{int(time.time())}",
            "color": f"#{i*50:02x}0000",
            "lineWidth": 5,
            "pathData": [{"x": 50 + i*10, "y": 50 + i*10}, {"x": 60 + i*10, "y": 60 + i*10}],
            "timestamp": int(time.time() * 1000)
        }
        strokes.append(stroke)
        
        requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke}
        )
    
    print(f"✅ Added {len(strokes)} test strokes")
    
    # Verify initial state
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    initial_count = len(response.json()["strokes"])
    print(f"📊 Initial stroke count: {initial_count}")
    
    # Perform cut operation (cutting first 2 strokes)
    cut_record = {
        "drawingId": f"cut_{int(time.time())}",
        "color": "#FFFFFF", 
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 45, "y": 45, "width": 30, "height": 30},
            "cut": True,
            "originalStrokeIds": [strokes[0]["drawingId"], strokes[1]["drawingId"]]
        },
        "timestamp": int(time.time() * 1000)
    }
    
    requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_record}
    )
    print("✂️ Performed cut operation")
    
    # Check state after cut
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    after_cut_strokes = response.json()["strokes"]
    after_cut_ids = {s["drawingId"] for s in after_cut_strokes}
    
    cut_stroke_ids = {strokes[0]["drawingId"], strokes[1]["drawingId"]}
    remaining_stroke_id = strokes[2]["drawingId"]
    
    if cut_stroke_ids.intersection(after_cut_ids):
        print("❌ Cut strokes still visible after cut")
        return
    
    if remaining_stroke_id in after_cut_ids:
        print("✅ Non-cut stroke still visible")
    else:
        print("❌ Non-cut stroke missing")
        return
    
    # Test undo operation
    print("\n🔄 Testing undo...")
    undo_response = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={}
    )
    
    if undo_response.status_code == 200:
        print("✅ Undo request successful")
    else:
        print(f"❌ Undo failed: {undo_response.status_code}")
        return
    
    # Check state after undo
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    after_undo_strokes = response.json()["strokes"]
    after_undo_ids = {s["drawingId"] for s in after_undo_strokes}
    
    # After undo, the cut should be reversed, so original strokes should be back
    if cut_stroke_ids.issubset(after_undo_ids):
        print("✅ Undo restored cut strokes")
    else:
        print(f"❌ Undo failed to restore cut strokes. Missing: {cut_stroke_ids - after_undo_ids}")
        return
    
    # Test redo operation
    print("\n↩️ Testing redo...")
    redo_response = requests.post(f"{API_BASE}/rooms/{room_id}/redo",
        headers={"Authorization": f"Bearer {token}"},
        json={}
    )
    
    if redo_response.status_code == 200:
        print("✅ Redo request successful")
    else:
        print(f"❌ Redo failed: {redo_response.status_code}")
        return
    
    # Check state after redo
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    after_redo_strokes = response.json()["strokes"]
    after_redo_ids = {s["drawingId"] for s in after_redo_strokes}
    
    # After redo, cut should be reapplied
    if not cut_stroke_ids.intersection(after_redo_ids):
        print("✅ Redo reapplied cut operation")
    else:
        print(f"❌ Redo failed to reapply cut. Visible cut strokes: {cut_stroke_ids.intersection(after_redo_ids)}")
        return
    
    # Final persistence test
    print("\n🔄 Testing final persistence...")
    for i in range(3):
        response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        final_strokes = response.json()["strokes"]
        final_ids = {s["drawingId"] for s in final_strokes}
        
        if not cut_stroke_ids.intersection(final_ids):
            print(f"✅ Persistence check {i+1}: Cut remains effective")
        else:
            print(f"❌ Persistence check {i+1}: Cut strokes reappeared")
            return
        
        time.sleep(0.5)
    
    print("\n🎉 Cut + Undo/Redo test PASSED!")
    print("   All cut operations work correctly with undo/redo functionality!")

if __name__ == "__main__":
    test_cut_undo_redo()