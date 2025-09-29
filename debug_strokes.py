#!/usr/bin/env python3
"""
Debug what happens to strokes when they are added - check Redis and MongoDB directly
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"
TEST_USER = "debug_user"
headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def check_redis():
    print("\n=== REDIS STATUS ===")
    # Check draw count
    count = redis_client.get('canvas-draw-count')
    print(f"Draw count: {count}")
    
    # Check for stroke keys
    keys = redis_client.keys('res-canvas-draw-*')
    print(f"Found {len(keys)} stroke keys:")
    for key in keys[:10]:  # Show first 10
        value = redis_client.get(key)
        print(f"  {key.decode() if isinstance(key, bytes) else key}: {len(str(value))} chars")

def check_mongodb():
    print("\n=== MONGODB STATUS ===")
    try:
        # Use the strokes collection directly
        count = strokes_coll.count_documents({})
        print(f"MongoDB stroke count: {count}")
        
        # Show recent strokes
        strokes = list(strokes_coll.find({}).sort('timestamp', -1).limit(5))
        print(f"Recent strokes:")
        for stroke in strokes:
            print(f"  ID: {stroke.get('id')}, User: {stroke.get('user')}, Time: {stroke.get('timestamp')}")
    except Exception as e:
        print(f"MongoDB error: {e}")

def add_stroke(stroke_id, points):
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'value': json.dumps({
            'id': stroke_id,
            'points': points,
            'color': '#FF0000',
            'width': 3,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER
        })
    }
    
    print(f"\nAdding stroke {stroke_id}...")
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data)
    print(f"Response: {response.status_code}")
    
    if response.status_code == 201:
        result = response.json()
        print(f"Server assigned ID: {result.get('id')}")
    
    return response.status_code == 201

def get_strokes():
    print(f"\nGetting strokes via API...")
    response = requests.get(f"{BASE_URL}/getCanvasData", headers=headers)
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        print(f"API returned {len(strokes)} strokes")
        for stroke in strokes:
            print(f"  {stroke.get('id')}: user={stroke.get('user')}")
        return strokes
    else:
        print(f"API error: {response.status_code}")
        return []

if __name__ == "__main__":
    print("=== STROKE DEBUGGING ===")
    
    # Clear everything
    print("\n1. Clearing all data")
    redis_client.flushall()
    requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={})
    
    check_redis()
    check_mongodb()
    
    # Add a stroke
    print("\n2. Adding one stroke")
    add_stroke("DEBUG_STROKE_1", [[50, 50], [60, 60]])
    
    check_redis()
    check_mongodb()
    get_strokes()
    
    # Add another stroke
    print("\n3. Adding second stroke")  
    add_stroke("DEBUG_STROKE_2", [[150, 150], [160, 160]])
    
    check_redis()
    check_mongodb()
    get_strokes()