#!/usr/bin/env python3
"""
Check what's actually being saved to MongoDB from new_line.py
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll

if __name__ == "__main__":
    # Check all documents in the strokes collection
    all_docs = list(strokes_coll.find({}))
    print(f"Total documents in MongoDB strokes collection: {len(all_docs)}")
    
    if all_docs:
        print("\nFirst 5 documents:")
        for i, doc in enumerate(all_docs[:5]):
            print(f"\n=== Document {i+1} ===")
            print(f"_id: {doc.get('_id')}")
            print(f"Keys: {list(doc.keys())}")
            
            # Check for different possible structures
            if 'asset' in doc:
                print("✅ HAS asset structure (expected by recovery)")
                if 'data' in doc['asset']:
                    data = doc['asset']['data']
                    print(f"   id: {data.get('id')}")
                    print(f"   roomId: {data.get('roomId')}")
                else:
                    print("❌ asset exists but no data inside")
            else:
                print("❌ NO asset structure (recovery will miss this)")
                print(f"   id: {doc.get('id')}")
                print(f"   roomId: {doc.get('roomId')}")
                print(f"   type: {doc.get('type')}")
    
    # Check specifically for recent test rooms
    test_rooms = ['recovery-debug-room', 'final-test-room', 'debug-test-room']
    for room in test_rooms:
        count = strokes_coll.count_documents({'roomId': room})
        asset_count = strokes_coll.count_documents({'asset.data.roomId': room})
        print(f"\nRoom '{room}': {count} flat docs, {asset_count} asset.data docs")