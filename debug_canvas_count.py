#!/usr/bin/env python3
"""
Debug canvas draw counts before and after Redis flush
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client
from services.canvas_counter import get_canvas_draw_count

BASE_URL = "http://localhost:10010"
TEST_USER = "count_debug"
ROOM_ID = "count-test-room"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def add_stroke(stroke_id):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'roomId': ROOM_ID,
        'value': json.dumps({
            'id': stroke_id,
            'points': [[10, 10], [20, 20]],
            'color': '#FF0000',
            'width': 3,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER,
            'roomId': ROOM_ID
        })
    }
    return requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data).status_code == 201

def check_counts():
    # Check canvas draw count
    draw_count = get_canvas_draw_count()
    
    # Check Redis keys
    redis_keys = redis_client.keys('res-canvas-draw-*')
    redis_count_key = redis_client.get('canvas-draw-count')
    
    print(f"   Canvas draw count: {draw_count}")
    print(f"   Redis 'canvas-draw-count': {redis_count_key}")
    print(f"   Redis stroke keys: {len(redis_keys)}")
    
    return draw_count

if __name__ == "__main__":
    print("=== CANVAS DRAW COUNT DEBUG ===")
    
    print("\n1. Initial state")
    check_counts()
    
    print("\n2. Adding 2 strokes")
    add_stroke("COUNT_A") 
    add_stroke("COUNT_B")
    
    count_after_add = check_counts()
    
    print("\n3. After Redis flush")
    redis_client.flushall()
    
    count_after_flush = check_counts()
    
    print(f"\n=== SUMMARY ===")
    print(f"Count after adding: {count_after_add}")
    print(f"Count after flush:  {count_after_flush}")
    
    if count_after_flush == 0:
        print("❌ ISSUE: Canvas draw count reset to 0 after Redis flush!")
        print("   This means recovery range is empty: range(0, 0)")
    else:
        print("✅ Canvas draw count preserved after Redis flush")
        print(f"   Recovery range would be: range(0, {count_after_flush})")