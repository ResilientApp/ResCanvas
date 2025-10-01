#!/usr/bin/env python3
import pymongo
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
uri = os.getenv('MONGO_ATLAS_URI')
client = pymongo.MongoClient(uri)
db = client['rescanvas']
strokes = db['strokes']

# Find room with recent activity
room_id = "68d32b48d56fc59130dcaf40"
print(f"Checking strokes for room: {room_id}\n")

# Get all strokes for this room
all_strokes = list(strokes.find({"roomId": room_id}).sort("ts", -1).limit(15))

print(f"Total strokes in room (last 15): {len(all_strokes)}\n")

for i, stroke in enumerate(all_strokes):
    stroke_data = None
    
    # Extract stroke data
    if 'asset' in stroke and 'data' in stroke['asset']:
        asset_data = stroke['asset']['data']
        if 'stroke' in asset_data:
            stroke_data = asset_data['stroke']
    elif 'stroke' in stroke:
        stroke_data = stroke['stroke']
    
    if stroke_data:
        drawing_id = stroke_data.get('id') or stroke_data.get('drawingId')
        path_data = stroke_data.get('pathData')
        
        # Check if it's a cut record
        is_cut = False
        original_ids = []
        if isinstance(path_data, dict) and path_data.get('tool') == 'cut':
            is_cut = True
            original_ids = path_data.get('originalStrokeIds', [])
        
        print(f"Stroke {i+1}:")
        print(f"  ID: {drawing_id}")
        print(f"  Type: {'CUT RECORD' if is_cut else 'NORMAL STROKE'}")
        if is_cut:
            print(f"  Original IDs being cut: {len(original_ids)} IDs")
            if len(original_ids) <= 5:
                for oid in original_ids:
                    print(f"    - {oid}")
        else:
            # Show if it's array (freehand) or shape
            if isinstance(path_data, list):
                print(f"  Path: Freehand stroke with {len(path_data)} points")
            elif isinstance(path_data, dict):
                print(f"  Path: Shape tool={path_data.get('tool', 'unknown')}")
        print()
