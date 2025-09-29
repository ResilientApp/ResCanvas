#!/usr/bin/env python3
"""
Debug why MongoDB recovery returns 0 strokes despite having data
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
import time
from services.db import redis_client, strokes_coll
from services.canvas_counter import get_canvas_draw_count

BASE_URL = "http://localhost:10010"  
TEST_USER = "recovery_debug_user"
ROOM_ID = "recovery-debug-room"
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

def debug_recovery_path():
    print("=== DEBUGGING MONGODB RECOVERY PATH ===")
    
    # Flush Redis completely
    redis_client.flushall()
    print("Redis flushed completely")
    
    # Check canvas counter
    canvas_count = get_canvas_draw_count()
    print(f"Canvas counter after flush: {canvas_count}")
    
    # Check what's actually in MongoDB
    all_mongo_strokes = list(strokes_coll.find({
        'asset.data.roomId': ROOM_ID
    }))
    print(f"\nMongoDB strokes for room {ROOM_ID}: {len(all_mongo_strokes)}")
    
    for i, stroke in enumerate(all_mongo_strokes):
        stroke_data = stroke.get('asset', {}).get('data', {})
        stroke_id = stroke_data.get('id', 'NO_ID')
        print(f"  [{i}] ID: {stroke_id}, Room: {stroke_data.get('roomId', 'NO_ROOM')}")
    
    # Check if any undo/redo data exists in MongoDB
    undo_docs = list(strokes_coll.find({'asset.data.type': 'undo'}))
    redo_docs = list(strokes_coll.find({'asset.data.type': 'redo'}))
    
    print(f"\nUndo documents in MongoDB: {len(undo_docs)}")
    print(f"Redo documents in MongoDB: {len(redo_docs)}")
    
    # Now manually trace what get_canvas_data would do
    print(f"\n=== RECOVERY SIMULATION ===")
    print(f"Canvas count: {canvas_count}")
    print(f"Range to recover: 0 to {canvas_count}")
    
    # Simulate the recovery loop
    mongo_map = {}
    for i in range(canvas_count):
        stroke_id = f"res-canvas-draw-{i}"
        stroke_doc = strokes_coll.find_one({
            'asset.data.id': stroke_id,
            'asset.data.roomId': ROOM_ID
        })
        if stroke_doc:
            mongo_map[stroke_id] = stroke_doc
            print(f"  Found in MongoDB: {stroke_id}")
        else:
            print(f"  NOT found in MongoDB: {stroke_id}")
    
    print(f"\nMongo map built with {len(mongo_map)} entries")
    
    # Check the actual API response
    print(f"\n=== ACTUAL API RESPONSE ===")
    response = requests.get(f"{BASE_URL}/getCanvasData?roomId={ROOM_ID}", headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        strokes = data.get('data', [])
        print(f"API returned {len(strokes)} strokes")
        for stroke in strokes:
            print(f"  - {stroke.get('id', 'NO_ID')}")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    print("Setting up test data...")
    
    # Clear everything first
    redis_client.flushall()
    
    # Add some strokes
    add_stroke("recovery_A", [[10, 10], [20, 20]]) 
    add_stroke("recovery_B", [[30, 30], [40, 40]])
    print("Added 2 test strokes")
    
    # Run debug
    debug_recovery_path()