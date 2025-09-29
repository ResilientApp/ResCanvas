#!/usr/bin/env python3
"""
Debug undo markers in MongoDB to see what IDs they use vs stroke IDs
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll
import json

ROOM_ID = "test-room-123" 

def debug_undo_markers():
    print("=== MONGODB STROKE AND UNDO MARKER ID ANALYSIS ===")
    
    # 1. Check stroke data 
    print("\n1. STROKES IN MONGODB:")
    strokes = list(strokes_coll.find({
        'roomId': ROOM_ID,
        'type': 'public'
    }).sort('ts', -1))
    
    print(f"Found {len(strokes)} strokes for room {ROOM_ID}")
    for stroke in strokes:
        print(f"  Stroke ID: {stroke.get('id')}")
        print(f"  MongoDB _id: {stroke.get('_id')}")
        print(f"  Original stroke data: {stroke.get('stroke', {}).get('id')}")
        
    # 2. Check for undo markers
    print(f"\n2. UNDO MARKERS IN MONGODB:")
    undo_markers = list(strokes_coll.find({
        '$or': [
            {'id': {'$regex': '^undo-'}},
            {'transactions.value.asset.data.id': {'$regex': '^undo-'}},
            {'value.asset.data.id': {'$regex': '^undo-'}},
            {'asset.data.id': {'$regex': '^undo-'}}
        ]
    }))
    
    print(f"Found {len(undo_markers)} undo markers")
    for marker in undo_markers:
        print(f"\n  Marker ID: {marker.get('id')}")
        print(f"  MongoDB _id: {marker.get('_id')}")
        if 'transactions' in marker:
            for tx in marker.get('transactions', []):
                asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
                if 'undo-' in asset_data.get('id', ''):
                    print(f"  Asset ID: {asset_data.get('id')}")
                    print(f"  Undone flag: {asset_data.get('undone')}")
                    print(f"  Referenced stroke: {asset_data.get('value', {})}")
        
    # 3. Check the stroke_states building logic simulation
    print(f"\n3. SIMULATING stroke_states BUILDING:")
    stroke_states = {}
    
    # Scan for undo/redo markers like get_canvas_data.py does
    for candidate_doc in strokes_coll.find():
        # Look in transactions array
        for tx in candidate_doc.get("transactions", []):
            try:
                asset = (tx.get("value") or {}).get("asset", {}).get("data", {}) if isinstance(tx.get("value"), dict) else {}
                if not isinstance(asset, dict):
                    continue
                
                aid = asset.get("id")
                if aid and ("undo-" in aid or "redo-" in aid):
                    prefix = "undo-" if "undo-" in aid else "redo-"
                    undone_flag = prefix == "undo-"
                    
                    ts_val = asset.get("ts") or asset.get("timestamp") or 0
                    user_val = asset.get("user")
                    # canonical stroke id without prefix
                    sid = aid.replace(prefix, "")
                    rec = {"id": aid, "user": user_val, "ts": ts_val, "undone": undone_flag}
                    existing = stroke_states.get(sid)
                    if not existing or ts_val > (existing.get("ts", 0) or 0):
                        stroke_states[sid] = rec
                        print(f"  Found marker: {aid} -> stroke_id: {sid}, undone: {undone_flag}")
                        
            except Exception as e:
                continue
    
    # Build undone_strokes set 
    undone_strokes = set()
    for stroke_id, state in stroke_states.items():
        if state.get("undone"):
            undone_strokes.add(stroke_id)
            print(f"  Stroke {stroke_id} is marked as undone")
            
    print(f"\n4. FINAL UNDONE_STROKES SET: {undone_strokes}")
    
    print(f"\n5. STROKE ID vs UNDONE CHECK:")
    for stroke in strokes:
        stroke_id = stroke.get('id')
        is_undone = stroke_id in undone_strokes
        print(f"  Stroke {stroke_id} -> undone: {is_undone}")

if __name__ == "__main__":
    debug_undo_markers()