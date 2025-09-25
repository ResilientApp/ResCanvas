#!/usr/bin/env python3
"""
Debug test to see what's happening in stroke retrieval with filtering
"""

import sys
import os
import time
import requests
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll
from services.graphql_service import GraphQLService

API_BASE = "http://localhost:5123"

def debug_persistence_issue():
    print("=== Debug Persistence Issue ===")
    
    # Find the most recent test room
    recent_docs = list(strokes_coll.find({"roomId": {"$regex": "^68d489"}}).sort("ts", -1).limit(5))
    
    if not recent_docs:
        print("No recent test room documents found")
        return
        
    room_id = recent_docs[0]["roomId"]
    print(f"Testing room: {room_id}")
    
    # Get all strokes for this room
    all_strokes = list(strokes_coll.find({"roomId": room_id}).sort("ts", 1))
    print(f"\nAll strokes in room ({len(all_strokes)}):")
    
    stroke_ids = set()
    for i, stroke_doc in enumerate(all_strokes):
        stroke_data = stroke_doc["stroke"]
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        stroke_ids.add(stroke_id)
        print(f"  Stroke {i+1}: id={stroke_id}, drawingId={stroke_data.get('drawingId')}")
    
    # Get persistent undo markers from GraphQL
    print(f"\nPersistent undo markers:")
    gql = GraphQLService()
    markers = gql.get_undo_markers(room_id)
    
    undone_stroke_ids = set()
    for marker in markers:
        marker_id = marker['id']
        if marker_id.startswith("undo-"):
            stroke_id = marker_id[5:]  # Remove "undo-" prefix
            undone_stroke_ids.add(stroke_id)
            print(f"  Marker: {marker_id} -> stroke_id: {stroke_id}")
    
    print(f"\nStroke IDs: {stroke_ids}")
    print(f"Undone stroke IDs: {undone_stroke_ids}")
    print(f"Overlap: {stroke_ids.intersection(undone_stroke_ids)}")
    
    # Show what would be filtered out
    remaining_strokes = []
    for stroke_doc in all_strokes:
        stroke_data = stroke_doc["stroke"]
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        if stroke_id not in undone_stroke_ids:
            remaining_strokes.append(stroke_data)
            print(f"  ✅ Keeping stroke: {stroke_id}")
        else:
            print(f"  ❌ Filtering out stroke: {stroke_id}")
    
    print(f"\nResult: {len(remaining_strokes)}/{len(all_strokes)} strokes would remain")

if __name__ == "__main__":
    debug_persistence_issue()