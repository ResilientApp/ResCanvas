#!/usr/bin/env python3
"""
Simulated frontend cut behavior test - exactly mimics what the JWT frontend does
"""
import requests
import json
import time

API_BASE = "http://localhost:10010"

def frontend_simulation_test():
    print("=== FRONTEND CUT BEHAVIOR SIMULATION ===\n")
    
    # 1. User registers and logs in
    username = f"frontend_sim_{int(time.time())}"
    requests.post(f"{API_BASE}/auth/register", json={
        "username": username, "password": "test123", "email": f"{username}@test.com"
    })
    login_resp = requests.post(f"{API_BASE}/auth/login", json={
        "username": username, "password": "test123"
    })
    token = login_resp.json()["token"]
    user = login_resp.json()["user"]
    
    # 2. User creates a room via Dashboard
    room_resp = requests.post(f"{API_BASE}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "User's Drawing Room", "type": "public"}
    )
    room_id = room_resp.json()["room"]["id"]
    print(f"🏠 User created room: {room_id}")
    
    # 3. User draws some strokes on the canvas
    drawing_strokes = []
    for i in range(4):
        stroke = {
            "drawingId": f"user_drawing_{i}_{int(time.time() * 1000)}",
            "color": ["#000000", "#ff0000", "#00ff00", "#0000ff"][i],
            "lineWidth": 5,
            "pathData": [
                {"x": 50 + i*20, "y": 50 + i*10}, 
                {"x": 70 + i*20, "y": 70 + i*10},
                {"x": 90 + i*20, "y": 60 + i*10}
            ],
            "timestamp": int(time.time() * 1000),
            "user": user["username"],
            "roomId": room_id
        }
        
        requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke}
        )
        drawing_strokes.append(stroke)
        time.sleep(0.1)  # Simulate drawing delay
    
    print(f"🎨 User drew {len(drawing_strokes)} strokes")
    
    # 4. User selects a rectangle area and cuts (like the real frontend does)
    print("\n✂️ User performs cut operation...")
    
    # Frontend creates erase strokes for visual feedback (white strokes over cut area)
    cut_stroke_ids = [drawing_strokes[1]["drawingId"], drawing_strokes[2]["drawingId"]]
    erase_strokes = []
    
    for orig_stroke in drawing_strokes[1:3]:  # Cut strokes 1 and 2
        erase_stroke = {
            "drawingId": f"erase_{orig_stroke['drawingId']}",
            "color": "#ffffff",
            "lineWidth": orig_stroke["lineWidth"] + 4,
            "pathData": orig_stroke["pathData"],
            "timestamp": int(time.time() * 1000),
            "user": user["username"],
            "roomId": room_id
        }
        
        requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": erase_stroke}
        )
        erase_strokes.append(erase_stroke)
    
    # Frontend creates the cut record
    cut_record = {
        "drawingId": f"cut_record_{int(time.time() * 1000)}",
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 60, "y": 50, "width": 60, "height": 40},
            "cut": True,
            "originalStrokeIds": cut_stroke_ids
        },
        "timestamp": int(time.time() * 1000),
        "user": user["username"],
        "roomId": room_id
    }
    
    requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": cut_record}
    )
    
    print(f"   Created {len(erase_strokes)} erase strokes and 1 cut record")
    
    # 5. User refreshes the page (multiple times to simulate real usage)
    print("\n🔄 User refreshes page multiple times...")
    
    for refresh_num in range(3):
        time.sleep(1)  # Simulate user delay
        
        # Get strokes (this is what happens when Canvas component loads)
        strokes_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        current_strokes = strokes_resp.json()["strokes"]
        current_ids = {s["drawingId"] for s in current_strokes}
        
        # Check if cut strokes are properly hidden
        cut_ids_visible = set(cut_stroke_ids).intersection(current_ids)
        if cut_ids_visible:
            print(f"   ❌ Refresh {refresh_num + 1}: Cut strokes reappeared! {cut_ids_visible}")
            return False
        else:
            print(f"   ✅ Refresh {refresh_num + 1}: Cut strokes remain hidden ({len(current_strokes)} total strokes)")
    
    # 6. User tries undo (using the undo button)
    print("\n↶ User clicks undo button...")
    
    undo_resp = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"}, json={}
    )
    print(f"   Undo response: {undo_resp.json()['status']}")
    
    # Check that cut strokes are restored
    after_undo_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    after_undo_strokes = after_undo_resp.json()["strokes"]
    after_undo_ids = {s["drawingId"] for s in after_undo_strokes}
    
    if set(cut_stroke_ids).issubset(after_undo_ids):
        print("   ✅ Cut strokes restored after undo")
    else:
        print("   ❌ Cut strokes not restored after undo")
        return False
    
    # 7. User clicks redo
    print("\n↷ User clicks redo button...")
    
    redo_resp = requests.post(f"{API_BASE}/rooms/{room_id}/redo",
        headers={"Authorization": f"Bearer {token}"}, json={}
    )
    print(f"   Redo response: {redo_resp.json()['status']}")
    
    # Check that cut is reapplied
    after_redo_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    after_redo_strokes = after_redo_resp.json()["strokes"]
    after_redo_ids = {s["drawingId"] for s in after_redo_strokes}
    
    if not set(cut_stroke_ids).intersection(after_redo_ids):
        print("   ✅ Cut reapplied after redo")
    else:
        print("   ❌ Cut not reapplied after redo")
        return False
    
    # 8. Final persistence test (user works for a while, refreshes occasionally)
    print("\n⏰ Simulating continued usage...")
    
    for i in range(5):
        time.sleep(0.5)
        
        # Simulate user refreshing/navigating
        strokes_resp = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        strokes = strokes_resp.json()["strokes"]
        stroke_ids = {s["drawingId"] for s in strokes}
        
        if set(cut_stroke_ids).intersection(stroke_ids):
            print(f"   ❌ Usage session {i+1}: Cut persistence failed")
            return False
    
    print("   ✅ Cut remains persistent during continued usage")
    
    print("\n🎉 FRONTEND SIMULATION TEST PASSED!")
    print("   The cut functionality behaves exactly as expected")
    print("   for real users in the JWT-based room system!")
    
    return True

if __name__ == "__main__":
    if frontend_simulation_test():
        print("\n✨ Cut functionality is ready for production use! ✨")
    else:
        print("\n❌ Frontend simulation revealed issues")