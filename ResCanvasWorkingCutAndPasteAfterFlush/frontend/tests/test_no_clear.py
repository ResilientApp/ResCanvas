#!/usr/bin/env python3
"""
Test Redis flush undo WITHOUT initial clear to avoid timestamp issues
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"
TEST_USER = "no_clear_test"
ROOM_ID = "test-room-456"  # Use different room to avoid old data
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

if __name__ == "__main__":
    print("=== REDIS FLUSH UNDO TEST (NO INITIAL CLEAR) ===")
    print(f"Using room: {ROOM_ID}, user: {TEST_USER}")
    
    # Clear Redis only, don't set clear timestamp
    print("\n1. Clearing Redis only (no timestamp)")
    redis_client.flushall()
    
    # Add 2 strokes
    print("\n2. Adding 2 strokes") 
    add_stroke("TEST_A", [[10, 10], [20, 20]])
    add_stroke("TEST_B", [[30, 30], [40, 40]])
    
    initial = get_strokes()
    print(f"   Initial: {len(initial)} strokes - {initial}")
    
    # Undo 1 stroke
    print("\n3. Undoing 1 stroke")
    success = undo()
    print(f"   Undo success: {success}")
    
    after_undo = get_strokes()
    print(f"   After undo: {len(after_undo)} strokes - {after_undo}")
    
    # Flush Redis
    print("\n4. FLUSHING REDIS")
    redis_client.flushall()
    
    # Test recovery
    recovered = get_strokes()
    print(f"   After Redis flush: {len(recovered)} strokes - {recovered}")
    
    print(f"\n=== RESULTS ===")
    print(f"Initial:      {len(initial)} strokes")  
    print(f"After undo:   {len(after_undo)} strokes")
    print(f"After flush:  {len(recovered)} strokes")
    
    if len(recovered) == len(after_undo):
        print("✅ SUCCESS: Undo state survived Redis flush!")
    else:
        print("❌ FAILED: Undo state not preserved after Redis flush")
        if len(recovered) > len(after_undo):
            print("   Issue: Undone stroke reappeared")
        else:
            print("   Issue: Recovery incomplete")