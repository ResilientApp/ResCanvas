#!/usr/bin/env python3
"""
Debug clear timestamp to understand filtering issue
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"
TEST_USER = "clear_debug"
ROOM_ID = "test-room-123"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def debug_clear_timestamps():
    print("=== CLEAR TIMESTAMP DEBUG ===")
    
    # Check current timestamps
    now = int(time.time() * 1000)
    print(f"\nCurrent timestamp: {now}")
    
    # 1. Add a stroke BEFORE clearing
    print("\n1. Adding stroke BEFORE clear")
    stroke_data = {
        'ts': now,
        'user': TEST_USER,
        'roomId': ROOM_ID,
        'value': json.dumps({
            'id': 'before_clear',
            'points': [[5, 5], [10, 10]],
            'color': '#FF0000',
            'width': 3,
            'timestamp': now,
            'user': TEST_USER,
            'roomId': ROOM_ID
        })
    }
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data)
    print(f"   Before clear stroke: {response.status_code}")
    
    # Get strokes before clear
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        before_clear = response.json().get('data', [])
        print(f"   Strokes before clear: {[s['id'] for s in before_clear]}")
    
    # 2. Clear canvas (this sets new clear timestamp)
    clear_time = int(time.time() * 1000)
    print(f"\n2. Clearing canvas at timestamp: {clear_time}")
    response = requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={'roomId': ROOM_ID})
    print(f"   Clear response: {response.status_code}")
    
    # Wait a bit to ensure different timestamps
    time.sleep(0.1)
    
    # 3. Add stroke AFTER clearing
    after_time = int(time.time() * 1000)
    print(f"\n3. Adding stroke AFTER clear at timestamp: {after_time}")
    stroke_data_after = {
        'ts': after_time,
        'user': TEST_USER,
        'roomId': ROOM_ID,
        'value': json.dumps({
            'id': 'after_clear',
            'points': [[15, 15], [20, 20]],
            'color': '#00FF00',
            'width': 3,
            'timestamp': after_time,
            'user': TEST_USER,
            'roomId': ROOM_ID
        })
    }
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data_after)
    print(f"   After clear stroke: {response.status_code}")
    
    # 4. Get strokes via API (should only show after-clear stroke)
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        after_clear_strokes = response.json().get('data', [])
        print(f"   Strokes after clear via API: {[s['id'] for s in after_clear_strokes]}")
    
    # 5. Flush Redis and test recovery
    print(f"\n4. Flushing Redis and testing recovery")
    redis_client.flushall()
    
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    if response.status_code == 200:
        recovered_strokes = response.json().get('data', [])
        print(f"   Recovered strokes: {[s['id'] for s in recovered_strokes]}")
        
        print(f"\n   Timestamp analysis:")
        print(f"   Clear time: {clear_time}")
        for stroke in recovered_strokes:
            stroke_ts = stroke.get('ts', 0)
            print(f"   Stroke {stroke['id']}: ts={stroke_ts}, after_clear={stroke_ts > clear_time}")

if __name__ == "__main__":
    debug_clear_timestamps()