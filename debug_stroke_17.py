#!/usr/bin/env python3
"""
Debug exactly what happens in the recovery loop for stroke 17
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import redis_client, strokes_coll
from services.canvas_counter import get_canvas_draw_count

ROOM_ID = "final-test-room"

if __name__ == "__main__":
    print("=== DEBUG RECOVERY LOOP FOR STROKE 17 ===")
    
    # Check canvas count  
    canvas_count = get_canvas_draw_count()
    print(f"Canvas count: {canvas_count}")
    
    # Check if stroke 17 is in the loop range
    for i in range(max(0, 17-2), min(canvas_count, 17+3)):  # Check around 17
        stroke_id = f"res-canvas-draw-{i}"
        print(f"\n--- Checking {stroke_id} (i={i}) ---")
        
        # Check if this stroke exists in MongoDB
        stroke_doc = strokes_coll.find_one({
            'asset.data.id': stroke_id,
            'asset.data.roomId': ROOM_ID
        })
        
        if stroke_doc:
            print(f"✅ Found in MongoDB")
            asset_data = stroke_doc.get('asset', {}).get('data', {})
            print(f"   ts: {asset_data.get('ts')}")
            print(f"   user: {asset_data.get('user')}")
            
            # Check if it would pass the recovery filtering
            print(f"   Passes recovery filtering:")
            print(f"     - starts with res-canvas-draw-: {asset_data.get('id', '').startswith('res-canvas-draw-')}")
            print(f"     - id present: {bool(asset_data.get('id'))}")
        else:
            print(f"❌ NOT found in MongoDB with asset.data structure")
            # Check if flat structure exists
            flat_doc = strokes_coll.find_one({'id': stroke_id}) 
            if flat_doc:
                print(f"   (but found with flat structure)")
            
    # Also check what the actual undo list contains
    print(f"\n=== UNDO STATE CHECK ===")
    
    # Check Redis undo lists
    undo_key = f"{ROOM_ID}:final_test_user:undo"
    redo_key = f"{ROOM_ID}:final_test_user:redo" 
    
    undo_list = redis_client.lrange(undo_key, 0, -1) if redis_client.exists(undo_key) else []
    redo_list = redis_client.lrange(redo_key, 0, -1) if redis_client.exists(redo_key) else []
    
    print(f"Redis undo list: {[item.decode() if isinstance(item, bytes) else str(item) for item in undo_list[:3]]}")
    print(f"Redis redo list: {[item.decode() if isinstance(item, bytes) else str(item) for item in redo_list[:3]]}")
    
    print(f"\n=== MANUAL RECOVERY TEST ===")
    # Manually simulate what get_canvas_data does
    mongo_map = {}
    start_idx = 0
    end_idx = canvas_count
    print(f"Recovery range: {start_idx} to {end_idx}")
    
    found_count = 0
    for i in range(start_idx, end_idx):
        stroke_id = f"res-canvas-draw-{i}"
        stroke_doc = strokes_coll.find_one({
            'asset.data.id': stroke_id,
            'asset.data.roomId': ROOM_ID
        })
        if stroke_doc:
            mongo_map[stroke_id] = stroke_doc
            found_count += 1
            if i >= 15:  # Only show recent ones
                print(f"  Found: {stroke_id}")
    
    print(f"Total found in mongo_map: {found_count}")
    print(f"Stroke 17 in mongo_map: {'res-canvas-draw-17' in mongo_map}")
    print(f"Stroke 18 in mongo_map: {'res-canvas-draw-18' in mongo_map}")