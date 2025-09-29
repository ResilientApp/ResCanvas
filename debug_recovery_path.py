#!/usr/bin/env python3
"""
Debug the exact recovery path to see why strokes aren't being recovered
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"
TEST_USER = "recovery_debug"
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

def get_strokes():
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        return data.get('data', [])
    return []

def debug_recovery():
    print("=== RECOVERY PATH DEBUG ===")
    
    # 1. Clear and add strokes
    print("\n1. Setting up test scenario")
    redis_client.flushall()
    requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={'roomId': ROOM_ID})
    
    success1, result1 = add_stroke("DEBUG_A", [[10, 10], [20, 20]])
    success2, result2 = add_stroke("DEBUG_B", [[30, 30], [40, 40]])
    print(f"   Added strokes: {success1} {success2}")
    
    initial = get_strokes()
    print(f"   Initial strokes: {[s['id'] for s in initial]}")
    
    # 2. Check what's in MongoDB after adding  
    print(f"\n2. MongoDB state after adding strokes")
    mongo_strokes = list(strokes_coll.find({'roomId': ROOM_ID, 'type': 'public'}).sort('ts', -1))
    print(f"   MongoDB has {len(mongo_strokes)} strokes for room {ROOM_ID}")
    for stroke in mongo_strokes:
        stroke_data = stroke.get('stroke', {})
        print(f"     ID: {stroke.get('id')}, Stroke ID: {stroke_data.get('id')}, User: {stroke.get('user')}")
    
    # 3. Check Redis state before flush
    print(f"\n3. Redis state before flush")
    redis_keys = redis_client.keys('res-canvas-draw-*')
    print(f"   Redis has {len(redis_keys)} stroke keys")
    for key in redis_keys[:5]:
        key_str = key.decode() if isinstance(key, bytes) else key
        print(f"     Key: {key_str}")
    
    # 4. Flush Redis 
    print(f"\n4. Flushing Redis")
    redis_client.flushall()
    redis_keys_after = redis_client.keys('res-canvas-draw-*') 
    print(f"   Redis keys after flush: {len(redis_keys_after)}")
    
    # 5. Try recovery
    print(f"\n5. Testing recovery")
    recovered = get_strokes()
    print(f"   Recovered strokes: {[s['id'] for s in recovered]}")
    
    # 6. Check MongoDB direct lookup
    print(f"\n6. Testing direct MongoDB transaction lookup")
    expected_ids = [s['id'] for s in initial]
    for stroke_id in expected_ids:
        # This is the lookup the recovery code uses
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": stroke_id},
            sort=[("_id", -1)]
        )
        print(f"   Transaction lookup for {stroke_id}: {'Found' if block else 'Not Found'}")
        
        # Check flat lookup 
        flat = strokes_coll.find_one({'id': stroke_id})
        print(f"   Flat lookup for {stroke_id}: {'Found' if flat else 'Not Found'}")

if __name__ == "__main__":
    debug_recovery()