#!/usr/bin/env python3
"""
Direct database test to simulate the exact filtering logic used in get_strokes route
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll
from services.graphql_service import GraphQLService
import json

def test_direct_filtering():
    print("=== Direct Database Filtering Test ===")
    
    # Find the most recent test room
    recent_docs = list(strokes_coll.find({"roomId": {"$regex": "^68d489"}}).sort("ts", -1).limit(5))
    
    if not recent_docs:
        print("No recent test room documents found")
        return
        
    room_id = recent_docs[0]["roomId"]
    print(f"Testing room: {room_id}")
    
    # Simulate the exact logic from get_strokes route
    print("\n=== Step 1: Building undone_strokes set ===")
    undone_strokes = set()
    
    # Get undo markers from GraphQL persistent storage (simulating Redis flush scenario)
    print(f"Checking GraphQL persistent storage for room {room_id}")
    try:
        graphql_service = GraphQLService()
        persistent_markers = graphql_service.get_undo_markers(room_id, "test_user")  # Hardcoded user from test
        print(f"Retrieved {len(persistent_markers)} persistent markers:")
        
        for marker in persistent_markers:
            marker_id = marker.get('id')
            undone = marker.get('undone')
            print(f"  Marker: {marker_id} (undone: {undone})")
            
            if marker.get('undone') and marker.get('id'):
                if marker_id.startswith("undo-"):
                    stroke_id = marker_id[5:]  # Remove "undo-" prefix
                    undone_strokes.add(stroke_id)
                    print(f"  -> Added {stroke_id} to undone_strokes")
    except Exception as e:
        print(f"Error loading persistent undo markers: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"\n=== Step 2: Loading room strokes ===")
    items = list(strokes_coll.find({"roomId": room_id}).sort("ts", 1))
    print(f"Found {len(items)} total strokes for room {room_id}")
    print(f"Undone strokes set: {undone_strokes}")
    
    print(f"\n=== Step 3: Filtering strokes ===")
    # Simulate public room filtering (most common case)
    filtered_strokes = []
    for it in items:
        stroke_data = it["stroke"]
        
        # Filter out undone strokes (legacy compatibility)
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        if stroke_id not in undone_strokes:
            filtered_strokes.append(stroke_data)
            print(f"  ✅ Keeping public stroke: {stroke_id}")
        else:
            print(f"  ❌ Filtering out public stroke: {stroke_id}")
    
    print(f"\n=== RESULT ===")
    print(f"Returning {len(filtered_strokes)}/{len(items)} strokes")
    
    if len(filtered_strokes) == 1:
        print("🎉 SUCCESS! Filtering logic would work correctly")
    else:
        print("❌ FAILURE! Filtering logic is broken")
        
    return len(filtered_strokes)

if __name__ == "__main__":
    test_direct_filtering()