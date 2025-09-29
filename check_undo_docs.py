#!/usr/bin/env python3
"""
Check if undo markers are being saved to MongoDB properly
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll

if __name__ == "__main__":
    # Check for any documents with undo/redo markers
    
    # Check for asset.data.id starting with undo-
    undo_docs = list(strokes_coll.find({'asset.data.id': {'$regex': '^undo-'}}))
    print(f"Documents with asset.data.id starting with 'undo-': {len(undo_docs)}")
    
    for doc in undo_docs[:3]:
        asset_data = doc.get('asset', {}).get('data', {})
        print(f"  - {asset_data.get('id')}: undone={asset_data.get('undone')}, ts={asset_data.get('ts')}")
    
    # Check for transactions.value.asset.data.id starting with undo-
    undo_txs = list(strokes_coll.find({'transactions.value.asset.data.id': {'$regex': '^undo-'}}))
    print(f"\nDocuments with transactions.value.asset.data.id starting with 'undo-': {len(undo_txs)}")
    
    for doc in undo_txs[:3]:
        print(f"  - Found transaction document with keys: {list(doc.keys())}")
        if 'transactions' in doc:
            for tx in doc['transactions'][:1]:  # Show first transaction
                asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
                print(f"    Transaction: {asset_data.get('id')}: undone={asset_data.get('undone')}")
    
    # Check any documents with 'undo' in any field name
    any_undo = list(strokes_coll.find({'$or': [
        {'id': {'$regex': 'undo'}},
        {'asset.data.id': {'$regex': 'undo'}}, 
        {'transactions.value.asset.data.id': {'$regex': 'undo'}}
    ]}))
    print(f"\nAny documents containing 'undo': {len(any_undo)}")
    
    if any_undo:
        recent_undo = any_undo[-1]  # Most recent
        print(f"Most recent undo document structure:")
        print(f"  Keys: {list(recent_undo.keys())}")
        if 'asset' in recent_undo and 'data' in recent_undo['asset']:
            asset_data = recent_undo['asset']['data']
            print(f"  asset.data.id: {asset_data.get('id')}")
            print(f"  asset.data.undone: {asset_data.get('undone')}")
    
    print(f"\nTotal documents in strokes collection: {strokes_coll.count_documents({})}")