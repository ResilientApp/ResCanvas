#!/usr/bin/env python3
"""
Comprehensive test of cut functionality in JWT rooms system
"""
import requests
import json
import time

API_BASE = "http://localhost:10010"

def get_auth():
    username = f"finaltest_{int(time.time())}"
    requests.post(f"{API_BASE}/auth/register", json={
        "username": username, "password": "test123", "email": f"{username}@test.com"
    })
    response = requests.post(f"{API_BASE}/auth/login", json={
        "username": username, "password": "test123"
    })
    return response.json()["token"], response.json()["user"]

def create_room(token, name):
    response = requests.post(f"{API_BASE}/rooms", 
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "type": "public"}
    )
    return response.json()["room"]["id"]

def add_stroke(token, room_id, stroke_data):
    response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": stroke_data}
    )
    return response.status_code == 200

def get_strokes(token, room_id):
    response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.json().get("strokes", [])

def undo(token, room_id):
    response = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"}, json={}
    )
    return response.json()

def redo(token, room_id):
    response = requests.post(f"{API_BASE}/rooms/{room_id}/redo",
        headers={"Authorization": f"Bearer {token}"}, json={}
    )
    return response.json()

def test_comprehensive_cut():
    print("=== COMPREHENSIVE CUT FUNCTIONALITY TEST ===\n")
    
    # Setup
    token, user = get_auth()
    room_id = create_room(token, "Comprehensive Cut Test")
    print(f"✅ Setup complete - Room: {room_id}, User: {user['username']}")
    
    # Test 1: Basic cut functionality
    print("\n1️⃣ Testing basic cut functionality...")
    
    # Add multiple strokes in different areas
    strokes = []
    stroke_data = [
        (100, 100, True),   # Will be cut
        (105, 105, True),   # Will be cut
        (200, 200, False),  # Will NOT be cut
        (300, 300, False),  # Will NOT be cut
    ]
    
    for i, (x, y, will_cut) in enumerate(stroke_data):
        stroke = {
            "drawingId": f"test_stroke_{i}_{int(time.time())}",
            "color": "#000000",
            "lineWidth": 5,
            "pathData": [{"x": x, "y": y}, {"x": x+10, "y": y+10}],
            "timestamp": int(time.time() * 1000)
        }
        strokes.append((stroke, will_cut))
        add_stroke(token, room_id, stroke)
    
    print(f"   Added {len(strokes)} test strokes")
    
    # Verify all strokes present
    initial_strokes = get_strokes(token, room_id)
    print(f"   Initial stroke count: {len(initial_strokes)}")
    
    # Perform cut
    cut_stroke_ids = [s[0]["drawingId"] for s in strokes if s[1]]
    cut_record = {
        "drawingId": f"cut_record_{int(time.time())}",
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 95, "y": 95, "width": 20, "height": 20},
            "cut": True,
            "originalStrokeIds": cut_stroke_ids
        },
        "timestamp": int(time.time() * 1000)
    }
    add_stroke(token, room_id, cut_record)
    print(f"   Cut operation performed on {len(cut_stroke_ids)} strokes")
    
    # Verify cut effect
    after_cut_strokes = get_strokes(token, room_id)
    after_cut_ids = {s["drawingId"] for s in after_cut_strokes}
    cut_ids_set = set(cut_stroke_ids)
    
    if not cut_ids_set.intersection(after_cut_ids):
        print("   ✅ Cut strokes properly hidden")
    else:
        print("   ❌ Cut strokes still visible")
        return False
    
    # Test 2: Undo cut operation
    print("\n2️⃣ Testing cut undo...")
    
    undo_result = undo(token, room_id)
    print(f"   Undo result: {undo_result['status']}")
    
    after_undo_strokes = get_strokes(token, room_id)
    after_undo_ids = {s["drawingId"] for s in after_undo_strokes}
    
    if cut_ids_set.issubset(after_undo_ids):
        print("   ✅ Cut strokes restored after undo")
    else:
        print("   ❌ Cut strokes not restored after undo")
        return False
    
    # Test 3: Redo cut operation
    print("\n3️⃣ Testing cut redo...")
    
    redo_result = redo(token, room_id)
    print(f"   Redo result: {redo_result['status']}")
    
    after_redo_strokes = get_strokes(token, room_id)
    after_redo_ids = {s["drawingId"] for s in after_redo_strokes}
    
    if not cut_ids_set.intersection(after_redo_ids):
        print("   ✅ Cut strokes hidden again after redo")
    else:
        print("   ❌ Cut strokes not hidden after redo")
        return False
    
    # Test 4: Persistence across multiple refreshes
    print("\n4️⃣ Testing persistence across refreshes...")
    
    for i in range(5):
        refresh_strokes = get_strokes(token, room_id)
        refresh_ids = {s["drawingId"] for s in refresh_strokes}
        
        if cut_ids_set.intersection(refresh_ids):
            print(f"   ❌ Refresh {i+1}: Cut strokes reappeared")
            return False
        
        time.sleep(0.3)
    print("   ✅ Cut persists across all refreshes")
    
    # Test 5: Multiple cut operations
    print("\n5️⃣ Testing multiple cut operations...")
    
    # Add more strokes
    new_strokes = []
    for i in range(2):
        stroke = {
            "drawingId": f"new_stroke_{i}_{int(time.time())}",
            "color": "#ff0000",
            "lineWidth": 3,
            "pathData": [{"x": 150+i*5, "y": 150+i*5}, {"x": 160+i*5, "y": 160+i*5}],
            "timestamp": int(time.time() * 1000)
        }
        new_strokes.append(stroke)
        add_stroke(token, room_id, stroke)
    
    # Perform second cut
    second_cut_ids = [s["drawingId"] for s in new_strokes]
    second_cut_record = {
        "drawingId": f"cut_record_2_{int(time.time())}",
        "color": "#FFFFFF",
        "lineWidth": 1,
        "pathData": {
            "tool": "cut",
            "rect": {"x": 145, "y": 145, "width": 25, "height": 25},
            "cut": True,
            "originalStrokeIds": second_cut_ids
        },
        "timestamp": int(time.time() * 1000)
    }
    add_stroke(token, room_id, second_cut_record)
    
    # Verify both cuts are effective
    final_strokes = get_strokes(token, room_id)
    final_ids = {s["drawingId"] for s in final_strokes}
    
    all_cut_ids = cut_ids_set.union(set(second_cut_ids))
    if not all_cut_ids.intersection(final_ids):
        print("   ✅ Multiple cut operations work correctly")
    else:
        print("   ❌ Multiple cut operations failed")
        return False
    
    print("\n🎉 ALL TESTS PASSED!")
    print("   Cut functionality is fully working in the JWT room system!")
    print("   ✅ Basic cut operations")
    print("   ✅ Cut undo/redo")
    print("   ✅ Persistence across refreshes") 
    print("   ✅ Multiple cut operations")
    return True

if __name__ == "__main__":
    if test_comprehensive_cut():
        print("\n🚀 Cut functionality fix is COMPLETE and WORKING!")
    else:
        print("\n❌ Some tests failed")