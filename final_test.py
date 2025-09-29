#!/usr/bin/env python3
"""
Final comprehensive test to confirm Redis flush undo fix is working
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"  
TEST_USER = "final_test_user"
ROOM_ID = "final-test-room"
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
    return response.status_code == 201

def get_strokes():
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        return [s['id'] for s in strokes]
    return []

def undo():
    response = requests.post(f"{BASE_URL}/undo", headers=headers, json={
        'userId': TEST_USER,
        'roomId': ROOM_ID
    })
    return response.status_code == 200 and response.json().get('status') == 'success'

def complete_redis_flush():
    """Flush Redis multiple times and check various keys to ensure complete flush"""
    print("   Performing complete Redis flush...")
    
    # Flush multiple times
    redis_client.flushall()
    redis_client.flushdb() 
    
    # Check if any stroke keys remain
    remaining_keys = redis_client.keys('*')
    print(f"   Keys remaining after flush: {len(remaining_keys)}")
    if remaining_keys:
        print(f"   Remaining keys: {[k.decode() if isinstance(k, bytes) else str(k) for k in remaining_keys[:10]]}")
    
    # Manually delete any remaining draw-related keys
    for pattern in ['res-canvas-draw-*', 'canvas-draw-*', 'undo-*', 'redo-*']:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            print(f"   Manually deleted {len(keys)} keys matching {pattern}")

if __name__ == "__main__":
    print("=== FINAL REDIS FLUSH UNDO TEST ===")
    print(f"Room: {ROOM_ID}, User: {TEST_USER}")
    
    # Complete Redis flush first
    complete_redis_flush()
    
    print("\n1. Adding 2 strokes")
    success1 = add_stroke("FINAL_A", [[10, 10], [20, 20]])
    success2 = add_stroke("FINAL_B", [[30, 30], [40, 40]])
    print(f"   Strokes added: {success1}, {success2}")
    
    initial = get_strokes()  
    print(f"   Initial strokes: {len(initial)} - {initial}")
    
    print("\n2. Undoing 1 stroke")
    undo_success = undo()
    print(f"   Undo success: {undo_success}")
    
    after_undo = get_strokes()
    print(f"   After undo: {len(after_undo)} strokes - {after_undo}")
    
    print("\n3. Complete Redis flush")
    complete_redis_flush()
    
    print("\n4. Testing recovery")
    recovered = get_strokes()
    print(f"   Recovered strokes: {len(recovered)} - {recovered}")
    
    print(f"\n=== FINAL VERDICT ===")
    print(f"Expected after undo: {len(after_undo)} strokes")
    print(f"Actual after flush:  {len(recovered)} strokes")
    
    if len(recovered) == len(after_undo):
        print("🎉 SUCCESS: Redis flush undo bug is FIXED!")
        print("   Undo state properly survives Redis cache flush")
        
        # Test that the undone stroke is indeed filtered
        if len(initial) == 2 and len(after_undo) == 1 and len(recovered) == 1:
            undone_stroke = [s for s in initial if s not in after_undo][0]
            if undone_stroke not in recovered:
                print(f"   ✅ Confirmed: Undone stroke '{undone_stroke}' correctly filtered out")
            else:
                print(f"   ⚠️  Warning: Undone stroke '{undone_stroke}' was not filtered")
                
    elif len(recovered) > len(after_undo):
        print("❌ BUG STILL EXISTS: Undone stroke reappeared after Redis flush")
        reappeared = [s for s in recovered if s not in after_undo]
        print(f"   Strokes that should be undone but reappeared: {reappeared}")
        
    elif len(recovered) < len(after_undo):
        print("❌ DIFFERENT ISSUE: Some strokes lost during recovery")
        lost = [s for s in after_undo if s not in recovered]  
        print(f"   Strokes lost: {lost}")
        
    else:
        print("❌ RECOVERY FAILED: No strokes recovered at all")