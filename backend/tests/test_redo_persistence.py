#!/usr/bin/env python3
"""
Test script to verify room redo persistence after Redis flush

This test demonstrates the issue where redo functionality breaks after Redis flush:
1. Draw 3 strokes
2. Undo 2 strokes  
3. Redo 1 stroke (second stroke reappears)
4. Flush Redis cache (simulating server restart)
5. Refresh canvas - the redone stroke should still be visible but currently disappears
"""

import json
import requests
import time
import subprocess
import sys
import os

# Add the backend directory to the path to import services
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.db import strokes_coll
from services.graphql_service import GraphQLService

API_BASE = "http://localhost:10010"

def test_register():
    """Register a test user"""
    try:
        response = requests.post(f"{API_BASE}/register", json={
            "username": "test_user", 
            "password": "test123"
        })
        return response.json()
    except Exception as e:
        print(f"Registration failed: {e}")
        return None

def test_login():
    """Login and get JWT token"""
    try:
        response = requests.post(f"{API_BASE}/login", json={
            "username": "test_user", 
            "password": "test123"
        })
        result = response.json()
        return result.get("access_token")
    except Exception as e:
        print(f"Login failed: {e}")
        return None

def test_create_room(token):
    """Create a test room"""
    try:
        response = requests.post(f"{API_BASE}/rooms", 
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Test Redo Room", "type": "public"}
        )
        result = response.json()
        return result.get("roomId")
    except Exception as e:
        print(f"Room creation failed: {e}")
        return None

def test_post_stroke(token, room_id, drawing_id):
    """Post a test stroke to the room"""
    stroke_data = {
        "id": drawing_id,
        "drawingId": drawing_id,
        "color": "#FF0000",
        "lineWidth": 5,
        "pathData": [[100, 100], [150, 150], [200, 200]],
        "ts": int(time.time() * 1000),
        "roomId": room_id
    }
    
    try:
        response = requests.post(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke_data}
        )
        return response.json().get("status") == "ok"
    except Exception as e:
        print(f"Stroke posting failed: {e}")
        return False

def test_get_strokes(token, room_id):
    """Get strokes from the room"""
    try:
        response = requests.get(f"{API_BASE}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"}
        )
        result = response.json()
        return result.get("strokes", [])
    except Exception as e:
        print(f"Getting strokes failed: {e}")
        return []

def test_undo(token, room_id):
    """Test undo operation"""
    try:
        response = requests.post(f"{API_BASE}/rooms/{room_id}/undo",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()
    except Exception as e:
        print(f"Undo failed: {e}")
        return {"status": "error"}

def test_redo(token, room_id):
    """Test redo operation"""
    try:
        response = requests.post(f"{API_BASE}/rooms/{room_id}/redo",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()
    except Exception as e:
        print(f"Redo failed: {e}")
        return {"status": "error"}

def flush_redis():
    """Flush Redis cache"""
    try:
        subprocess.run(["redis-cli", "FLUSHALL"], check=True)
        print("Redis cache flushed")
        return True
    except Exception as e:
        print(f"Failed to flush Redis: {e}")
        return False

def check_persistent_markers(room_id):
    """Check what undo markers exist in persistent storage"""
    print(f"\n=== Checking Persistent Markers for Room {room_id} ===")
    
    try:
        # Check MongoDB directly
        docs = list(strokes_coll.find({
            "transactions.value.asset.data.id": {"$regex": "undo-"}
        }))
        
        markers = []
        for doc in docs:
            for tx in doc.get('transactions', []):
                asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
                marker_id = asset_data.get('id', '')
                if marker_id.startswith('undo-'):
                    markers.append({
                        'id': marker_id,
                        'undone': asset_data.get('undone'),
                        'ts': asset_data.get('ts'),
                        'stroke_id': marker_id[5:]  # Remove 'undo-' prefix
                    })
        
        print(f"Found {len(markers)} persistent markers:")
        for marker in markers:
            print(f"  {marker['id']}: undone={marker['undone']}, ts={marker['ts']}")
        
        return markers
        
    except Exception as e:
        print(f"Error checking persistent markers: {e}")
        return []

def main():
    print("=== Room Redo Persistence After Redis Flush Test ===")
    
    test_register()
    
    token = test_login()
    if not token:
        print("Login failed")
        return
    print("Login successful")
    
    room_id = test_create_room(token)
    if not room_id:
        print("Room creation failed")
        return
    print(f"Room created: {room_id}")
    
    stroke_ids = []
    for i in range(3):
        drawing_id = f"test_stroke_{i}_{int(time.time() * 1000)}"
        stroke_ids.append(drawing_id)
        if test_post_stroke(token, room_id, drawing_id):
            print(f"Stroke {i+1} posted: {drawing_id}")
        else:
            print(f"Stroke {i+1} failed")
            return
        time.sleep(0.1)
    
    strokes = test_get_strokes(token, room_id)
    print(f"{len(strokes)} strokes visible after posting")
    
    print("\n--- Undoing last two strokes ---")
    for i in range(2):
        result = test_undo(token, room_id)
        if result.get("status") == "ok":
            print(f"Undo {i+1} successful")
        else:
            print(f"Undo {i+1} failed: {result}")
            return
        time.sleep(0.1)
    
    strokes = test_get_strokes(token, room_id)
    print(f"{len(strokes)} strokes visible after undos")
    if len(strokes) != 1:
        print(f"Expected 1 stroke, got {len(strokes)}")
        return
    
    print("\n--- Redoing last undo ---")
    result = test_redo(token, room_id)
    if result.get("status") == "ok":
        print("Redo successful")
    else:
        print(f"Redo failed: {result}")
        return
    
    strokes = test_get_strokes(token, room_id)
    print(f"{len(strokes)} strokes visible after redo")
    if len(strokes) != 2:
        print(f"Expected 2 strokes, got {len(strokes)}")
        return
    
    markers_before = check_persistent_markers(room_id)
    
    print("\n--- Flushing Redis cache ---")
    if not flush_redis():
        return
    
    markers_after = check_persistent_markers(room_id)
    
    print("\n--- Getting strokes after Redis flush ---")
    strokes_after_flush = test_get_strokes(token, room_id)
    print(f"{len(strokes_after_flush)} strokes visible after Redis flush")
    
    print(f"\n=== RESULTS ===")
    print(f"Before Redis flush: {len(strokes)} strokes")
    print(f"After Redis flush: {len(strokes_after_flush)} strokes")
    print(f"Persistent markers: {len(markers_after)}")
    
    if len(strokes_after_flush) == 2:
        print("🎉 SUCCESS! Redo persistence works correctly")
    else:
        print("❌ FAILURE! Redo persistence is broken")
        print("\nIssue: After Redis flush, the system loses track of redo operations")
        print("The redone stroke disappears because the system only considers undo markers,")
        print("not the newer redo markers that should override them.")
        
        print(f"\nDetailed marker analysis:")
        stroke_states = {}
        for marker in markers_after:
            stroke_id = marker['stroke_id']
            if stroke_id not in stroke_states:
                stroke_states[stroke_id] = []
            stroke_states[stroke_id].append(marker)
        
        for stroke_id, states in stroke_states.items():
            print(f"  Stroke {stroke_id}:")
            states.sort(key=lambda x: x['ts'])
            for state in states:
                print(f"    ts={state['ts']}: undone={state['undone']}")
            
            # The most recent state should determine visibility
            latest_state = states[-1]
            should_be_visible = not latest_state['undone']
            print(f"    → Should be visible: {should_be_visible}")

if __name__ == "__main__":
    main()
