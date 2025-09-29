#!/usr/bin/env python3
"""
Check the new document structure being saved by new_line.py
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll

if __name__ == "__main__":
    # Check recent documents with asset.data structure  
    asset_docs = list(strokes_coll.find({'asset.data': {'$exists': True}}).sort('_id', -1).limit(5))
    print(f"Recent documents with asset.data structure: {len(asset_docs)}")
    
    for i, doc in enumerate(asset_docs):
        print(f"\n=== Asset Document {i+1} ===")
        asset_data = doc.get('asset', {}).get('data', {})
        print(f"   id: {asset_data.get('id')}")
        print(f"   roomId: {asset_data.get('roomId')}")
        print(f"   user: {asset_data.get('user')}")
        print(f"   ts: {asset_data.get('ts')}")
        print(f"   Keys in asset.data: {list(asset_data.keys())}")
        
    # Check specifically for stroke ids 17 and 18
    for stroke_id in ['res-canvas-draw-17', 'res-canvas-draw-18']:
        doc = strokes_coll.find_one({'asset.data.id': stroke_id})
        if doc:
            print(f"\nFound {stroke_id} with asset.data structure:")
            print(f"   Room: {doc['asset']['data'].get('roomId')}")  
        else:
            # Check old flat structure
            flat_doc = strokes_coll.find_one({'id': stroke_id})
            if flat_doc:
                print(f"\nFound {stroke_id} with flat structure (not asset.data)")
            else:
                print(f"\n❌ {stroke_id} NOT found in MongoDB at all")