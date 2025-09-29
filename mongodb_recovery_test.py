#!/usr/bin/env python3
"""
Test the EXACT scenario: draw strokes, undo one, flush redis, see if undone stroke reappears
This test focuses on MongoDB recovery with undo filtering
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"
TEST_USER = "mongodb_test_user"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def add_stroke(stroke_id, points):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'value': json.dumps({
            'id': stroke_id,
            'points': points,
            'color': '#0000FF',
            'width': 2,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER
        })
    }
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data)
    print(f"Add {stroke_id}: {response.status_code}")
    return response.status_code == 201

def get_strokes():
    response = requests.get(f"{BASE_URL}/getCanvasData", headers=headers)
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        stroke_ids = [s['id'] for s in strokes]
        print(f"Strokes found: {len(strokes)} - {stroke_ids}")
        return stroke_ids
    return []

def undo():
    response = requests.post(f"{BASE_URL}/undo", headers=headers, json={'userId': TEST_USER})
    if response.status_code == 200:
        result = response.json()
        print(f"Undo: {result.get('status')}")
        return result.get('status') == 'success'
    return False

if __name__ == "__main__":
    print("=== MongoDB Recovery with Undo Filtering Test ===\n")
    
    # Clear everything first
    print("1. Clearing all data")
    redis_client.flushall()
    requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={})
    
    # Add 2 strokes
    print("\n2. Adding 2 strokes")
    add_stroke("MONGO_X", [[100, 100], [110, 110]])
    add_stroke("MONGO_Y", [[200, 200], [210, 210]])
    
    # Get initial strokes
    initial_strokes = get_strokes()
    print(f"Initial: {len(initial_strokes)} strokes")
    
    # Undo 1 stroke 
    print("\n3. Undoing 1 stroke")
    undo_success = undo()
    
    if undo_success:
        after_undo = get_strokes()
        print(f"After undo: {len(after_undo)} strokes")
        
        # Now the critical test: flush Redis but keep MongoDB data
        print("\n4. Flushing Redis (this removes cached strokes but keeps MongoDB)")
        redis_client.flushall()
        
        # The MongoDB should still have the stroke data AND the undo markers
        # getCanvasData should recover from MongoDB and respect undo state
        print("\n5. Getting strokes after Redis flush (MongoDB recovery)")
        recovered_strokes = get_strokes()
        print(f"After Redis flush: {len(recovered_strokes)} strokes")
        
        print(f"\n== RESULTS ==")
        print(f"Before undo:     {len(initial_strokes)} strokes")
        print(f"After undo:      {len(after_undo)} strokes")  
        print(f"After Redis flush: {len(recovered_strokes)} strokes")
        
        if len(recovered_strokes) == len(after_undo):
            print("✅ SUCCESS: Undo state survived Redis flush via MongoDB recovery")
        else:
            print("❌ BUG: Undone stroke reappeared after Redis flush!")
            print("   This means MongoDB recovery is not respecting undo markers")
    else:
        print("❌ Undo failed, cannot test MongoDB recovery")