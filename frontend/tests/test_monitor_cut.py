#!/usr/bin/env python3
"""
Monitor backend requests during a cut operation to debug the issue
"""
import time
import threading
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

# Track all requests to the backend
captured_requests = []

class RequestCapture:
    def __init__(self):
        self.requests = []
    
    def add_request(self, method, path, data):
        self.requests.append({
            'timestamp': time.time(),
            'method': method,
            'path': path,
            'data': data
        })
    
    def get_recent_requests(self, since_time):
        return [r for r in self.requests if r['timestamp'] > since_time]

def monitor_requests_to_room(room_id, token, duration=10):
    """Monitor all stroke requests to a specific room"""
    print(f"📡 Monitoring requests to room {room_id} for {duration} seconds...")
    
    start_time = time.time()
    requests_found = []
    
    # We'll poll the room's stroke list and compare snapshots
    initial_resp = requests.get(f"http://localhost:10010/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    initial_strokes = initial_resp.json().get("strokes", [])
    initial_ids = {s["drawingId"] for s in initial_strokes}
    
    print(f"   Initial strokes: {len(initial_strokes)}")
    
    # Monitor for new strokes
    while time.time() - start_time < duration:
        time.sleep(0.5)
        
        current_resp = requests.get(f"http://localhost:10010/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        current_strokes = current_resp.json().get("strokes", [])
        current_ids = {s["drawingId"] for s in current_strokes}
        
        new_ids = current_ids - initial_ids
        if new_ids:
            for stroke in current_strokes:
                if stroke["drawingId"] in new_ids:
                    requests_found.append({
                        'timestamp': time.time(),
                        'stroke_id': stroke["drawingId"],
                        'type': 'new_stroke',
                        'data': stroke
                    })
                    print(f"   📥 New stroke detected: {stroke['drawingId']}")
                    if stroke.get("pathData") and isinstance(stroke["pathData"], dict):
                        if stroke["pathData"].get("tool") == "cut":
                            print(f"      🔹 CUT RECORD detected")
                        elif isinstance(stroke["pathData"], list):
                            print(f"      🔹 STROKE with {len(stroke['pathData'])} points")
                        else:
                            print(f"      🔹 SHAPE: {stroke['pathData'].get('tool', 'unknown')}")
            
            initial_ids = current_ids
    
    return requests_found

def test_frontend_cut_monitoring():
    print("=== FRONTEND CUT MONITORING TEST ===\n")
    
    # Login
    login_resp = requests.post("http://localhost:10010/auth/login", json={
        "username": "testuser",
        "password": "testpass"
    })
    
    if login_resp.status_code != 200:
        print("❌ Failed to login")
        return False
    
    token = login_resp.json()["token"]
    room_id = "68d32b48d56fc59130dcaf40"
    
    print(f"✅ Logged in, monitoring room {room_id}")
    
    # Clear room
    requests.post(f"http://localhost:10010/rooms/{room_id}/clear",
        headers={"Authorization": f"Bearer {token}"})
    
    # Add initial stroke that will be cut
    print("\n1️⃣ Adding stroke to be cut...")
    stroke_id = f"test_stroke_{int(time.time() * 1000)}"
    test_stroke = {
        "drawingId": stroke_id,
        "color": "#ff0000",
        "lineWidth": 5,
        "pathData": [
            {"x": 100, "y": 100},
            {"x": 200, "y": 100},
            {"x": 300, "y": 100}
        ],
        "timestamp": int(time.time() * 1000)
    }
    
    requests.post(f"http://localhost:10010/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": test_stroke}
    )
    
    print(f"✅ Added test stroke: {stroke_id}")
    
    # Now monitor what happens during a "cut" operation
    print(f"\n2️⃣ Now go to http://localhost:3000/rooms/{room_id} in your browser")
    print(f"   Login as 'testuser' with password 'testpass'")
    print(f"   Draw a selection rectangle over the middle of the red line")
    print(f"   Click the cut tool")
    print(f"   This test will monitor what requests are made...")
    
    # Monitor for 30 seconds to give time for manual testing
    captured = monitor_requests_to_room(room_id, token, duration=30)
    
    print(f"\n📊 Monitoring Results:")
    print(f"   Captured {len(captured)} new requests")
    
    cut_records = 0
    replacement_segments = 0
    erase_strokes = 0
    
    for req in captured:
        stroke = req['data']
        path_data = stroke.get('pathData')
        
        if isinstance(path_data, dict):
            if path_data.get('tool') == 'cut':
                cut_records += 1
                print(f"   🔹 Cut record: {stroke['drawingId']}")
                print(f"      Original stroke IDs: {path_data.get('originalStrokeIds', [])}")
            elif path_data.get('tool') == 'shape':
                print(f"   🔹 Shape: {stroke['drawingId']} ({path_data.get('type', 'unknown')})")
        elif isinstance(path_data, list):
            if stroke.get('color') == '#ffffff':
                erase_strokes += 1
                print(f"   🔹 Erase stroke: {stroke['drawingId']} (white)")
            else:
                replacement_segments += 1
                print(f"   🔹 Replacement segment: {stroke['drawingId']} ({len(path_data)} points)")
    
    print(f"\n📈 Summary:")
    print(f"   Cut records: {cut_records}")
    print(f"   Replacement segments: {replacement_segments}")
    print(f"   Erase strokes: {erase_strokes}")
    
    if cut_records > 0 and replacement_segments > 0:
        print(f"\n✅ Frontend is correctly submitting replacement segments!")
        return True
    elif cut_records > 0:
        print(f"\n⚠️  Cut records found but no replacement segments")
        print(f"    This indicates the frontend fix is not active")
        return False
    else:
        print(f"\n❌ No cut operation detected")
        return False

if __name__ == "__main__":
    test_frontend_cut_monitoring()