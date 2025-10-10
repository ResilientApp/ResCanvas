#!/usr/bin/env python3
"""
Test script to reproduce the Redis flush issue:
1. Draw 2 strokes
2. Undo 1 stroke 
3. Flush Redis cache
4. Check if undone stroke reappears
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"
ROOM = None  # Test global canvas
TEST_USER = "test_flush_user"

# Test JWT token (replace with valid token)
TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg"

headers = {'Authorization': f'Bearer {TOKEN}'}

def clear_canvas():
    """Clear the global canvas"""
    response = requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", 
                           headers=headers,
                           json={})
    print(f"Clear canvas: {response.status_code}")

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
    response = requests.post(f"{BASE_URL}/submitNewLine", 
                           headers=headers, 
                           json=stroke_data)
    print(f"Add stroke {stroke_id}: {response.status_code}")
    if response.status_code != 201:
        print(f"  Error: {response.text}")
    return response.status_code == 201

def get_canvas_data():
    """Get all strokes from the canvas"""
    response = requests.get(f"{BASE_URL}/getCanvasData", headers=headers)
    if response.status_code == 200:
        data = response.json()
        print(f"Response data: {data}")
        strokes = data.get('data', [])  # Changed from 'drawings' to 'data' 
        stroke_ids = []
        for stroke in strokes:
            if isinstance(stroke, dict) and 'id' in stroke:
                stroke_ids.append(stroke['id'])
            elif isinstance(stroke, str):
                try:
                    parsed = json.loads(stroke)
                    if 'id' in parsed:
                        stroke_ids.append(parsed['id'])
                except:
                    pass
        print(f"Get canvas data: {len(strokes)} strokes - {stroke_ids}")
        return strokes
    else:
        print(f"Get canvas data failed: {response.status_code}")
        return []

def undo_stroke():
    """Undo the last stroke"""
    response = requests.post(f"{BASE_URL}/undo", 
                           headers=headers, 
                           json={'userId': TEST_USER})
    print(f"Undo stroke: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"Undo result: {result}")
    return response.status_code == 200

def check_redis_markers():
    """Check what undo/redo markers exist in Redis"""
    print("\n=== Redis Markers ===")
    
    # Check undo markers
    undo_keys = redis_client.keys("undo-*")
    print(f"Undo markers in Redis: {len(undo_keys)}")
    for key in undo_keys:
        if isinstance(key, bytes):
            key = key.decode()
        data = redis_client.get(key)
        if data:
            try:
                marker = json.loads(data)
                print(f"  {key}: user={marker.get('user')}, undone={marker.get('undone')}, ts={marker.get('ts')}")
            except:
                print(f"  {key}: {data}")
    
    # Check redo markers
    redo_keys = redis_client.keys("redo-*")
    print(f"Redo markers in Redis: {len(redo_keys)}")
    for key in redo_keys:
        if isinstance(key, bytes):
            key = key.decode()
        data = redis_client.get(key)
        if data:
            try:
                marker = json.loads(data)
                print(f"  {key}: user={marker.get('user')}, undone={marker.get('undone')}, ts={marker.get('ts')}")
            except:
                print(f"  {key}: {data}")

def check_mongo_markers():
    """Check what undo/redo markers exist in MongoDB"""
    print("\n=== MongoDB Markers ===")
    
    # Search for undo markers
    undo_cursor = strokes_coll.find(
        {"transactions.value.asset.data.id": {"$regex": "^undo-"}},
        sort=[("_id", -1)]
    )
    
    undo_markers = []
    for doc in undo_cursor:
        for tx in doc.get("transactions", []):
            asset_data = tx.get("value", {}).get("asset", {}).get("data", {})
            if asset_data.get("id", "").startswith("undo-"):
                undo_markers.append(asset_data)
    
    print(f"Undo markers in MongoDB: {len(undo_markers)}")
    for marker in undo_markers:
        print(f"  {marker.get('id')}: undone={marker.get('undone')}, ts={marker.get('ts')}")
    
    # Search for redo markers
    redo_cursor = strokes_coll.find(
        {"transactions.value.asset.data.id": {"$regex": "^redo-"}},
        sort=[("_id", -1)]
    )
    
    redo_markers = []
    for doc in redo_cursor:
        for tx in doc.get("transactions", []):
            asset_data = tx.get("value", {}).get("asset", {}).get("data", {})
            if asset_data.get("id", "").startswith("redo-"):
                redo_markers.append(asset_data)
    
    print(f"Redo markers in MongoDB: {len(redo_markers)}")
    for marker in redo_markers:
        print(f"  {marker.get('id')}: undone={marker.get('undone')}, ts={marker.get('ts')}")

def flush_redis():
    """Flush Redis cache"""
    print("\n=== Flushing Redis Cache ===")
    redis_client.flushdb()
    print("Redis cache flushed!")

def test_redis_flush_scenario():
    """Test the complete Redis flush scenario"""
    print("=== Testing Redis Flush Undo Issue ===\n")
    
    # Step 1: Clear canvas and verify empty
    print("1. Clear canvas and verify empty")
    clear_canvas()
    strokes = get_canvas_data()
    assert len(strokes) == 0, f"Expected 0 strokes after clear, got {len(strokes)}"
    print("✅ Canvas cleared successfully\n")
    
    # Step 2: Add 2 strokes
    print("2. Add 2 strokes")
    add_stroke("test-stroke-1", [[10, 10], [20, 20]])
    add_stroke("test-stroke-2", [[30, 30], [40, 40]])
    
    strokes = get_canvas_data()
    print(f"✅ Added 2 strokes, now have {len(strokes)} total\n")
    
    # Step 3: Undo 1 stroke
    print("3. Undo 1 stroke")
    undo_stroke()
    
    strokes = get_canvas_data()
    print(f"After undo: {len(strokes)} strokes visible")
    
    # Step 4: Check markers before flush
    print("\n4. Check markers before Redis flush")
    check_redis_markers()
    check_mongo_markers()
    
    # Step 5: Flush Redis
    print("\n5. Flush Redis cache")
    flush_redis()
    
    # Step 6: Check markers after flush
    print("\n6. Check markers after Redis flush")
    check_redis_markers()
    check_mongo_markers()
    
    # Step 7: Get canvas data after flush - this is where the issue occurs
    print("\n7. Get canvas data after Redis flush (THE CRITICAL TEST)")
    strokes_after_flush = get_canvas_data()
    print(f"After Redis flush: {len(strokes_after_flush)} strokes visible")
    
    if len(strokes_after_flush) > len(strokes):
        print("❌ BUG REPRODUCED: Undone stroke reappeared after Redis flush!")
        print("The MongoDB recovery logic is not working properly")
    elif len(strokes_after_flush) == len(strokes):
        print("✅ No issue: Undo state properly recovered from MongoDB")
    else:
        print("? Unexpected: Fewer strokes than expected")
    
    return len(strokes_after_flush) != len(strokes)

if __name__ == "__main__":
    try:
        bug_reproduced = test_redis_flush_scenario()
        if bug_reproduced:
            print("\n🔍 ANALYSIS:")
            print("The issue is that the MongoDB recovery logic in getCanvasData")
            print("is not properly restoring the undo/redo markers after Redis flush.")
            print("This needs to be debugged and fixed.")
        else:
            print("\n✅ No bug found - undo/redo state properly persists across Redis flush")
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()