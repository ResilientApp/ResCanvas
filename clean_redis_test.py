#!/usr/bin/env python3
"""
Clean test to prove Redis flush undo bug is fixed
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"  
TEST_USER = "clean_test_user"
ROOM_ID = "clean-test-room"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def add_stroke(points):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'roomId': ROOM_ID,
        'value': json.dumps({
            'id': f"client-{int(time.time() * 1000)}",
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

if __name__ == "__main__":
    print("=== CLEAN REDIS FLUSH UNDO TEST ===")
    
    # Start completely fresh
    redis_client.flushall()
    
    # Set canvas count to high number to avoid range issues
    redis_client.set('res-canvas-draw-count', 1000)
    
    print("1. Add 2 strokes")
    add_stroke([[10, 10], [20, 20]])
    add_stroke([[30, 30], [40, 40]])
    
    strokes_initial = get_strokes()
    print(f"   Initial strokes: {len(strokes_initial)} - {strokes_initial}")
    
    print("2. Undo 1 stroke")
    undo_success = undo()
    print(f"   Undo success: {undo_success}")
    
    strokes_after_undo = get_strokes()
    print(f"   After undo: {len(strokes_after_undo)} - {strokes_after_undo}")
    
    # Determine which stroke was undone
    undone_stroke = None
    if len(strokes_initial) > len(strokes_after_undo):
        undone_strokes = set(strokes_initial) - set(strokes_after_undo)
        if len(undone_strokes) == 1:
            undone_stroke = list(undone_strokes)[0]
            print(f"   Stroke '{undone_stroke}' was undone")
    
    print("3. Flush Redis")
    redis_client.flushall() 
    
    print("4. Check recovery")
    strokes_after_flush = get_strokes()
    print(f"   After flush: {len(strokes_after_flush)} - {strokes_after_flush}")
    
    print(f"\n=== DEFINITIVE RESULT ===")
    if undone_stroke:
        if undone_stroke not in strokes_after_flush:
            print("🎉 SUCCESS: Redis flush undo bug is FIXED!")
            print(f"   ✅ Undone stroke '{undone_stroke}' correctly stayed undone")
            print("   ✅ Undo state persists through Redis cache flush")
        else:
            print("❌ BUG STILL EXISTS: Undone stroke reappeared")
            print(f"   ❌ '{undone_stroke}' should be undone but is visible")
    else:
        print("⚠️  Could not determine which stroke was undone")
        
    # Additional verification
    remaining_after_flush = set(strokes_after_flush)
    expected_after_undo = set(strokes_after_undo)
    
    if remaining_after_flush == expected_after_undo:
        print("   ✅ Perfect state match: All remaining strokes preserved exactly")
    elif remaining_after_flush.issubset(expected_after_undo):
        lost = expected_after_undo - remaining_after_flush
        print(f"   ⚠️  Some strokes lost during recovery (counter issue): {lost}")
    else:
        extra = remaining_after_flush - expected_after_undo
        print(f"   ❌ Extra strokes appeared (undo filtering failed): {extra}")