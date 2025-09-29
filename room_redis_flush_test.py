#!/usr/bin/env python3
"""
Test the original Redis flush undo issue using proper room-based approach
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"
TEST_USER = "room_test_user"
ROOM_ID = "test-room-123"  # Use a specific room
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def add_stroke_to_room(stroke_id, points):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'roomId': ROOM_ID,  # Include room ID
        'value': json.dumps({
            'id': stroke_id,
            'points': points,
            'color': '#FF0000',
            'width': 3,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER,
            'roomId': ROOM_ID
        })
    }
    
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data)
    print(f"Add {stroke_id} to room {ROOM_ID}: {response.status_code}")
    if response.status_code == 201:
        result = response.json()
        print(f"  Server assigned ID: {result.get('id', 'None')}")
    return response.status_code == 201

def get_strokes_from_room():
    # Include roomId parameter in the API call
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        stroke_ids = [s['id'] for s in strokes]
        print(f"Room {ROOM_ID} has {len(strokes)} strokes: {stroke_ids}")
        return stroke_ids
    else:
        print(f"API error: {response.status_code}")
        return []

def undo():
    # Include roomId in undo request
    response = requests.post(f"{BASE_URL}/undo", headers=headers, json={
        'userId': TEST_USER,
        'roomId': ROOM_ID
    })
    if response.status_code == 200:
        result = response.json()
        print(f"Undo in room {ROOM_ID}: {result.get('status')}")
        return result.get('status') == 'success'
    else:
        print(f"Undo failed: {response.status_code}")
        return False

def clear_room():
    # Clear the specific room
    response = requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={
        'roomId': ROOM_ID
    })
    print(f"Clear room {ROOM_ID}: {response.status_code}")

def check_redis():
    # Check Redis state
    keys = redis_client.keys('res-canvas-draw-*')
    print(f"Redis has {len(keys)} stroke keys")
    
    # Check undo markers for the room
    undo_keys = redis_client.keys(f'undo-{TEST_USER}-{ROOM_ID}*')
    redo_keys = redis_client.keys(f'redo-{TEST_USER}-{ROOM_ID}*')
    print(f"Undo markers: {len(undo_keys)}, Redo markers: {len(redo_keys)}")

if __name__ == "__main__":
    print("=== ROOM-BASED REDIS FLUSH UNDO TEST ===")
    print(f"Using room: {ROOM_ID}, user: {TEST_USER}\n")
    
    # 1. Clear everything
    print("1. Clearing room data")
    redis_client.flushall()
    clear_room()
    check_redis()
    
    # 2. Add 2 strokes to the room
    print("\n2. Adding 2 strokes to room")
    add_stroke_to_room("ROOM_STROKE_1", [[100, 100], [110, 110]])
    add_stroke_to_room("ROOM_STROKE_2", [[200, 200], [210, 210]])
    
    initial_strokes = get_strokes_from_room()
    check_redis()
    
    # 3. Undo 1 stroke in the room
    print("\n3. Undoing 1 stroke in room")
    if undo():
        after_undo = get_strokes_from_room()
        check_redis()
        
        # 4. THE CRITICAL TEST: Flush Redis
        print("\n4. REDIS FLUSH (the moment of truth)")
        redis_client.flushall()
        print("   Redis flushed - all cache data gone!")
        check_redis()
        
        # 5. Check if undo state survives
        print("\n5. Checking room state after Redis flush")
        recovered_strokes = get_strokes_from_room()
        
        print(f"\n=== RESULTS ===")
        print(f"Initial strokes:      {len(initial_strokes)}")
        print(f"After undo:           {len(after_undo)}")
        print(f"After Redis flush:    {len(recovered_strokes)}")
        
        if len(recovered_strokes) == len(after_undo):
            print("✅ SUCCESS: Undo state survived Redis flush!")
            print("   MongoDB recovery correctly applied undo filtering")
        else:
            print("❌ BUG CONFIRMED: Undone stroke reappeared!")
            print("   This is the exact issue you reported")
            print(f"   Expected {len(after_undo)} strokes, got {len(recovered_strokes)}")
    else:
        print("❌ Undo operation failed - cannot test Redis flush behavior")