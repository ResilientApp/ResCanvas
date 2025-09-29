#!/usr/bin/env python3
"""
Simple test to verify undo filtering in recovery
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"  
TEST_USER = "undo_filter_test"
ROOM_ID = "undo-filter-room"
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
    print("=== SIMPLE UNDO FILTER TEST ===")
    
    # Clear Redis
    redis_client.flushall()
    
    print("1. Add one stroke")
    add_stroke([[10, 10], [20, 20]])
    
    strokes_before = get_strokes()
    print(f"   Strokes before undo: {strokes_before}")
    
    print("2. Undo the stroke") 
    undo_success = undo()
    print(f"   Undo success: {undo_success}")
    
    strokes_after_undo = get_strokes()
    print(f"   Strokes after undo: {strokes_after_undo}")
    
    print("3. Flush Redis")
    redis_client.flushall()
    
    print("4. Check recovery")
    strokes_after_flush = get_strokes()
    print(f"   Strokes after flush: {strokes_after_flush}")
    
    print(f"\n=== RESULT ===")
    print(f"Before undo: {len(strokes_before)} strokes")
    print(f"After undo:  {len(strokes_after_undo)} strokes") 
    print(f"After flush: {len(strokes_after_flush)} strokes")
    
    if len(strokes_after_flush) == len(strokes_after_undo):
        print("✅ SUCCESS: Undo state preserved after Redis flush")
    elif len(strokes_after_flush) > len(strokes_after_undo):
        print("❌ BUG: Undone stroke reappeared after Redis flush")
        print(f"   Reappeared strokes: {set(strokes_after_flush) - set(strokes_after_undo)}")
    else:
        print("❌ ERROR: Some strokes lost during recovery")