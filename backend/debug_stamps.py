#!/usr/bin/env python3
"""
Debug script to check if custom stamps are being stored correctly in MongoDB
"""

import os
import sys
import json
from pymongo import MongoClient

# Get MongoDB connection from environment
MONGO_URI = os.environ.get('MONGO_ATLAS_URI') or os.environ.get('MONGO_URL')
MONGO_DB = os.environ.get('MONGO_DB', 'canvasCache')
MONGO_COLLECTION = os.environ.get('MONGO_COLLECTION', 'strokes')

if not MONGO_URI:
    print("ERROR: MONGO_ATLAS_URI or MONGO_URL not set")
    sys.exit(1)

print(f"Connecting to MongoDB...")
print(f"Database: {MONGO_DB}")
print(f"Collection: {MONGO_COLLECTION}")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB]
coll = db[MONGO_COLLECTION]

# Get the most recent strokes
print("\n=== Checking Recent Strokes ===")
recent_strokes = list(coll.find().sort("_id", -1).limit(10))

print(f"Found {len(recent_strokes)} recent strokes\n")

for i, stroke_doc in enumerate(recent_strokes):
    print(f"\n--- Stroke {i+1} ---")
    print(f"_id: {stroke_doc.get('_id')}")
    print(f"roomId: {stroke_doc.get('roomId')}")
    print(f"ts: {stroke_doc.get('ts')}")
    
    # Check if this is a stamp
    stroke_data = None
    
    if 'stroke' in stroke_doc:
        stroke_data = stroke_doc['stroke']
    elif 'asset' in stroke_doc and 'data' in stroke_doc['asset'] and 'stroke' in stroke_doc['asset']['data']:
        stroke_data = stroke_doc['asset']['data']['stroke']
    elif 'transactions' in stroke_doc and stroke_doc['transactions']:
        try:
            stroke_data = stroke_doc['transactions'][0]['value']['asset']['data']['stroke']
        except (KeyError, IndexError, TypeError):
            pass
    
    if stroke_data:
        print(f"Drawing Type: {stroke_data.get('drawingType', 'stroke')}")
        print(f"Brush Type: {stroke_data.get('brushType', 'normal')}")
        
        # Check for stamp data
        has_stamp_data = 'stampData' in stroke_data
        has_stamp_settings = 'stampSettings' in stroke_data
        
        if has_stamp_data or has_stamp_settings:
            print("\n🎨 THIS IS A STAMP!")
            print(f"Has stampData: {has_stamp_data}")
            print(f"Has stampSettings: {has_stamp_settings}")
            
            if has_stamp_data:
                stamp_data = stroke_data['stampData']
                print(f"\nstampData keys: {list(stamp_data.keys() if isinstance(stamp_data, dict) else [])}")
                
                if isinstance(stamp_data, dict):
                    print(f"  - emoji: {stamp_data.get('emoji', 'N/A')}")
                    print(f"  - name: {stamp_data.get('name', 'N/A')}")
                    
                    if 'image' in stamp_data:
                        image_data = stamp_data['image']
                        if isinstance(image_data, str):
                            # Check if it's a base64 data URL
                            if image_data.startswith('data:image'):
                                print(f"  - image: data URL (length: {len(image_data)} chars)")
                                # Show first 100 chars
                                print(f"    Preview: {image_data[:100]}...")
                            else:
                                print(f"  - image: {image_data}")
                        else:
                            print(f"  - image: {type(image_data)}")
            
            if has_stamp_settings:
                stamp_settings = stroke_data['stampSettings']
                print(f"\nstampSettings: {stamp_settings}")
        
        # Check metadata
        if 'metadata' in stroke_data:
            metadata = stroke_data['metadata']
            print(f"\nMetadata keys: {list(metadata.keys() if isinstance(metadata, dict) else [])}")
            if isinstance(metadata, dict):
                print(f"  - drawingType: {metadata.get('drawingType')}")
                print(f"  - has stampData: {'stampData' in metadata}")
                print(f"  - has stampSettings: {'stampSettings' in metadata}")
    else:
        print("Could not extract stroke data from document")

print("\n\n=== Searching Specifically for Stamps ===")

# Search for documents with stampData
stamp_query = {
    "$or": [
        {"stroke.stampData": {"$exists": True}},
        {"stroke.drawingType": "stamp"},
        {"asset.data.stroke.stampData": {"$exists": True}},
        {"asset.data.stroke.drawingType": "stamp"},
        {"transactions.value.asset.data.stroke.stampData": {"$exists": True}},
        {"transactions.value.asset.data.stroke.drawingType": "stamp"}
    ]
}

stamp_count = coll.count_documents(stamp_query)
print(f"\nFound {stamp_count} stamps in database")

if stamp_count > 0:
    print("\nShowing up to 5 stamp documents:")
    stamps = list(coll.find(stamp_query).limit(5))
    for i, stamp_doc in enumerate(stamps):
        print(f"\n--- Stamp {i+1} ---")
        print(f"Document structure: {json.dumps(stamp_doc, default=str, indent=2)[:500]}...")

client.close()
print("\n\nDone!")
