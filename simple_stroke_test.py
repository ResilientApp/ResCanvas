#!/usr/bin/env python3
"""
Simple test to see what happens when we add strokes
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client

BASE_URL = "http://localhost:10010"
TEST_USER = "test_user"

# Test JWT token 
TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg"

headers = {'Authorization': f'Bearer {TOKEN}'}

def add_stroke(stroke_id, points):
    """Add a stroke to the canvas"""
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'value': json.dumps({
            'id': stroke_id,
            'points': points,
            'color': '#000000',
            'width': 2,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER
        })
    }
    print(f"Submitting: {stroke_data}")
    response = requests.post(f"{BASE_URL}/submitNewLine", 
                           headers=headers, 
                           json=stroke_data)
    print(f"Add stroke {stroke_id}: {response.status_code}")
    if response.status_code != 201:
        print(f"  Error: {response.text}")
    
    # Check Redis immediately after
    draw_count = redis_client.get('res-canvas-draw-count')
    print(f"  Draw count after: {draw_count}")
    
    return response.status_code == 201

def get_canvas_data():
    """Get all strokes from the canvas"""
    response = requests.get(f"{BASE_URL}/getCanvasData", headers=headers)
    if response.status_code == 200:
        data = response.json()
        print(f"Full response: {data}")
        return data.get('data', [])
    else:
        print(f"Get canvas data failed: {response.status_code} - {response.text}")
        return []

def check_redis_after():
    """Check what's in Redis"""
    print("\n=== Redis Contents ===")
    draw_count = redis_client.get('res-canvas-draw-count')
    print(f"Draw count: {draw_count}")
    
    # Check for stroke data
    for i in range(0, 10):
        key = f'res-canvas-draw-{i}'
        data = redis_client.get(key)
        if data:
            print(f"{key}: {data}")

if __name__ == "__main__":
    print("=== Simple Stroke Test ===\n")
    
    print("1. Adding first stroke")
    add_stroke("test-stroke-A", [[10, 10], [20, 20]])
    
    print("\n2. Checking canvas data")
    strokes = get_canvas_data()
    print(f"Found {len(strokes)} strokes")
    
    print("\n3. Adding second stroke") 
    add_stroke("test-stroke-B", [[30, 30], [40, 40]])
    
    print("\n4. Checking canvas data again")
    strokes = get_canvas_data()
    print(f"Found {len(strokes)} strokes")
    
    check_redis_after()