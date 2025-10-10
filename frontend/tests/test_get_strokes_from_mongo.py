#!/usr/bin/env python3
"""
Test get_strokes_from_mongo directly to see what it returns for our room
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

# Import the function directly 
from routes.get_canvas_data import get_strokes_from_mongo

BASE_URL = "http://localhost:10010"
TEST_USER = "mongo_debug_user"
ROOM_ID = "test-room-123"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def add_stroke(stroke_id, points):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'roomId': ROOM_ID,
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
    return response.status_code == 201, response.json() if response.status_code == 201 else None

def test_get_strokes_from_mongo():
    print("=== DIRECT get_strokes_from_mongo() TEST ===")
    
    # Clear everything
    print("\n1. Clearing all data")
    redis_client.flushall()
    requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={'roomId': ROOM_ID})
    
    # Add a stroke
    print("\n2. Adding test stroke")
    success, result = add_stroke("MONGO_TEST_STROKE", [[50, 50], [60, 60]])
    print(f"   Add stroke result: {success}, {result}")
    
    # Test get_strokes_from_mongo directly
    print(f"\n3. Testing get_strokes_from_mongo(room_id='{ROOM_ID}')")
    try:
        mongo_items = get_strokes_from_mongo(None, None, ROOM_ID)
        print(f"   Found {len(mongo_items)} items from MongoDB")
        
        for i, item in enumerate(mongo_items):
            print(f"   Item {i}:")
            print(f"     ID: {item.get('id')}")
            print(f"     User: {item.get('user')}")
            print(f"     TS: {item.get('ts')}")
            print(f"     Undone: {item.get('undone')}")
            print(f"     Value preview: {str(item.get('value', ''))[:100]}...")
    except Exception as e:
        print(f"   ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test without room filter  
    print(f"\n4. Testing get_strokes_from_mongo(room_id=None)")
    try:
        all_items = get_strokes_from_mongo(None, None, None)
        print(f"   Found {len(all_items)} total items from MongoDB")
        
        # Look for our room items in the full list
        room_items = [item for item in all_items if item.get('value', '').find(ROOM_ID) != -1]
        print(f"   Items containing room ID '{ROOM_ID}': {len(room_items)}")
        
        for item in room_items:
            print(f"     ID: {item.get('id')}, User: {item.get('user')}")
            
    except Exception as e:
        print(f"   ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_get_strokes_from_mongo()