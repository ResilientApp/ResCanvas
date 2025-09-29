#!/usr/bin/env python3
"""
Clean test to verify Redis flush undo issue with fresh data
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"
TEST_USER = "clean_test_user"

headers = {'Authorization': f'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg'}

def clear_all():
    """Completely clear all data"""
    print("🧹 Clearing all data...")
    # Clear Redis
    redis_client.flushall()
    # Clear relevant MongoDB data (be careful with this in production!)
    requests.post(f"{BASE_URL}/submitClearCanvasTimestamp", headers=headers, json={})
    print("✅ All data cleared")

def add_stroke(stroke_id, points):
    """Add a stroke"""
    stroke_data = {
        'ts': int(time.time() * 1000),
        'user': TEST_USER,
        'value': json.dumps({
            'id': stroke_id,
            'points': points,
            'color': '#FF0000',  # Red to distinguish our test strokes
            'width': 3,
            'timestamp': int(time.time() * 1000),
            'user': TEST_USER
        })
    }
    response = requests.post(f"{BASE_URL}/submitNewLine", headers=headers, json=stroke_data)
    success = response.status_code == 201
    print(f"{'✅' if success else '❌'} Add {stroke_id}: {response.status_code}")
    return success

def get_strokes():
    """Get stroke data with IDs"""
    response = requests.get(f"{BASE_URL}/getCanvasData", headers=headers)
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        stroke_ids = [s['id'] for s in strokes]
        print(f"📊 Found {len(strokes)} strokes: {stroke_ids}")
        return stroke_ids
    else:
        print(f"❌ Failed to get strokes: {response.status_code}")
        return []

def undo():
    """Undo last stroke"""
    response = requests.post(f"{BASE_URL}/undo", headers=headers, json={'userId': TEST_USER})
    if response.status_code == 200:
        result = response.json()
        print(f"{'✅' if result.get('status') == 'success' else '❌'} Undo: {result.get('status')}")
        return result.get('status') == 'success'
    else:
        print(f"❌ Undo failed: {response.status_code}")
        return False

def check_undo_markers():
    """Check undo markers in Redis"""
    undo_keys = [k.decode() if isinstance(k, bytes) else k for k in redis_client.keys("undo-*")]
    print(f"🔍 Undo markers in Redis: {undo_keys}")
    return undo_keys

if __name__ == "__main__":
    print("=== CLEAN Redis Flush Undo Test ===\n")
    
    # Step 1: Start completely fresh
    clear_all()
    
    # Step 2: Add test strokes
    print("\n📝 Adding 2 test strokes...")
    add_stroke("CLEAN_A", [[10, 10], [15, 15]])
    add_stroke("CLEAN_B", [[20, 20], [25, 25]]) 
    
    stroke_ids_before = get_strokes()
    print(f"✅ Before undo: {len(stroke_ids_before)} strokes")
    
    # Step 3: Undo one stroke
    print("\n↶ Undoing last stroke...")
    undo_success = undo()
    
    if undo_success:
        stroke_ids_after_undo = get_strokes()
        print(f"✅ After undo: {len(stroke_ids_after_undo)} strokes")
        
        # Check undo markers
        undo_markers = check_undo_markers()
        
        # Step 4: Flush Redis
        print("\n🧹 Flushing Redis...")
        redis_client.flushall()
        print("✅ Redis flushed")
        
        # Step 5: Check if undone stroke reappears
        print("\n🔍 Checking strokes after Redis flush...")
        stroke_ids_after_flush = get_strokes()
        print(f"Final result: {len(stroke_ids_after_flush)} strokes")
        
        # Compare results
        print(f"\n📋 SUMMARY:")
        print(f"  Before undo: {len(stroke_ids_before)} strokes")
        print(f"  After undo:  {len(stroke_ids_after_undo)} strokes") 
        print(f"  After flush: {len(stroke_ids_after_flush)} strokes")
        
        if len(stroke_ids_after_flush) == len(stroke_ids_after_undo):
            print("🎉 SUCCESS: Undo state persisted through Redis flush!")
        else:
            print("❌ BUG REPRODUCED: Undone stroke reappeared after Redis flush!")
            print(f"   Expected: {len(stroke_ids_after_undo)} strokes") 
            print(f"   Got:      {len(stroke_ids_after_flush)} strokes")
    else:
        print("❌ Undo failed, cannot test Redis flush")