#!/usr/bin/env python3
"""
Check what undo markers exist in MongoDB after undos but before Redis flush
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll
import json

print("=== Checking Undo Markers in MongoDB ===")

# Search for any transactions with "undo" in the asset data id
undo_marker_query = {
    "transactions.value.asset.data.id": {"$regex": "undo.*marker"}
}

print(f"Query: {undo_marker_query}")
undo_docs = list(strokes_coll.find(undo_marker_query))
print(f"Found {len(undo_docs)} documents with undo markers")

if undo_docs:
    for doc in undo_docs:
        print("\nUndo marker document:")
        for tx in doc.get('transactions', []):
            asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
            if 'undo' in asset_data.get('id', ''):
                print(json.dumps(asset_data, indent=2))
                print('---')
else:
    print("No undo marker documents found!")
    
    # Check for any documents that might contain undo-related data
    print("\nSearching for any documents with 'undo' in asset.data...")
    broader_query = {
        "transactions.value.asset.data": {"$regex": "undo", "$options": "i"}
    }
    broader_docs = list(strokes_coll.find(broader_query))
    print(f"Found {len(broader_docs)} documents with 'undo' in asset data")
    
    # Also check what the latest few documents look like
    print("\nLatest 5 documents in strokes collection:")
    latest_docs = list(strokes_coll.find().sort("_id", -1).limit(5))
    for doc in latest_docs:
        print(f"Document {doc['_id']}:")
        for tx in doc.get('transactions', []):
            asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
            print(f"  Asset ID: {asset_data.get('id', 'N/A')}")
        print()